const request = require("supertest");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const app = require("../src/app");
const db = require("../src/db");

function createToken(userId) {
  return jwt.sign(
    { userId },
    process.env.JWT_SECRET
  );
}

describe("Expenses security and idempotency", () => {
  let user1Id;
  let user2Id;

  beforeEach(() => {
    db.prepare("DELETE FROM expenses").run();
    db.prepare("DELETE FROM users").run();

    const passwordHash = bcrypt.hashSync(
      "Password123",
      12
    );

    const user1 = db
      .prepare(`
        INSERT INTO users (email, password_hash)
        VALUES (?, ?)
      `)
      .run("user1@test.com", passwordHash);

    const user2 = db
      .prepare(`
        INSERT INTO users (email, password_hash)
        VALUES (?, ?)
      `)
      .run("user2@test.com", passwordHash);

    user1Id = Number(user1.lastInsertRowid);
    user2Id = Number(user2.lastInsertRowid);
  });

  test("one user cannot read another user's expense", async () => {
    const user1Token = createToken(user1Id);
    const user2Token = createToken(user2Id);

    const createResponse = await request(app)
      .post("/api/expenses")
      .set("Authorization", `Bearer ${user1Token}`)
      .set("Idempotency-Key", "user1-expense-001")
      .send({
        description: "Private expense",
        amount: 500,
      });

    expect(createResponse.statusCode).toBe(201);

    const expenseId = createResponse.body.expense.id;

    const response = await request(app)
      .get(`/api/expenses/${expenseId}`)
      .set("Authorization", `Bearer ${user2Token}`);

    expect(response.statusCode).toBe(404);

    expect(response.body.error).toBe(
      "Expense not found"
    );
  });

  test("one user cannot delete another user's expense", async () => {
    const user1Token = createToken(user1Id);
    const user2Token = createToken(user2Id);

    const createResponse = await request(app)
      .post("/api/expenses")
      .set("Authorization", `Bearer ${user1Token}`)
      .set("Idempotency-Key", "user1-delete-test-001")
      .send({
        description: "Protected expense",
        amount: 750,
      });

    expect(createResponse.statusCode).toBe(201);

    const expenseId = createResponse.body.expense.id;

    const deleteResponse = await request(app)
      .delete(`/api/expenses/${expenseId}`)
      .set("Authorization", `Bearer ${user2Token}`);

    expect(deleteResponse.statusCode).toBe(404);

    expect(deleteResponse.body.error).toBe(
      "Expense not found"
    );

    const expenseStillExists = db
      .prepare("SELECT id FROM expenses WHERE id = ?")
      .get(expenseId);

    expect(expenseStillExists).toBeDefined();
  });

  test("repeated write with the same idempotency key returns the first result", async () => {
    const user1Token = createToken(user1Id);

    const firstResponse = await request(app)
      .post("/api/expenses")
      .set("Authorization", `Bearer ${user1Token}`)
      .set("Idempotency-Key", "retry-test-001")
      .send({
        description: "Internet bill",
        amount: 500,
      });

    expect(firstResponse.statusCode).toBe(201);

    const secondResponse = await request(app)
      .post("/api/expenses")
      .set("Authorization", `Bearer ${user1Token}`)
      .set("Idempotency-Key", "retry-test-001")
      .send({
        description: "Internet bill",
        amount: 500,
      });

    expect(secondResponse.statusCode).toBe(200);

    expect(secondResponse.body.expense.id).toBe(
      firstResponse.body.expense.id
    );

    const rows = db
      .prepare("SELECT COUNT(*) AS count FROM expenses")
      .get();

    expect(rows.count).toBe(1);
  });

  test("concurrent requests with the same idempotency key create only one expense", async () => {
    const user1Token = createToken(user1Id);

    const requests = [
      request(app)
        .post("/api/expenses")
        .set("Authorization", `Bearer ${user1Token}`)
        .set("Idempotency-Key", "concurrent-test-001")
        .send({
          description: "Concurrent expense",
          amount: 1000,
        }),

      request(app)
        .post("/api/expenses")
        .set("Authorization", `Bearer ${user1Token}`)
        .set("Idempotency-Key", "concurrent-test-001")
        .send({
          description: "Concurrent expense",
          amount: 1000,
        }),
    ];

    const [firstResponse, secondResponse] =
      await Promise.all(requests);

    expect([201, 200]).toContain(
      firstResponse.statusCode
    );

    expect([201, 200]).toContain(
      secondResponse.statusCode
    );

    const rows = db
      .prepare(`
        SELECT id, description, amount
        FROM expenses
        WHERE user_id = ? AND idempotency_key = ?
      `)
      .all(user1Id, "concurrent-test-001");

    expect(rows).toHaveLength(1);

    expect(rows[0].description).toBe(
      "Concurrent expense"
    );

    expect(rows[0].amount).toBe(1000);
  });
});