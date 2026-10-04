const request = require("supertest");
const app = require("../src/app");

describe("Authentication", () => {
  test("protected route rejects unauthenticated requests", async () => {
    const response = await request(app)
      .get("/api/expenses");

    expect(response.statusCode).toBe(401);

    expect(response.body.error).toBe(
      "Authentication required"
    );
  });
});