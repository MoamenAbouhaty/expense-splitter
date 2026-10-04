const express = require("express");

const db = require("../db");
const authenticate = require("../middleware/auth");

const router = express.Router();

router.use(authenticate);

router.get("/", (req, res) => {
  const expenses = db
    .prepare(`
      SELECT id, description, amount, created_at
      FROM expenses
      WHERE user_id = ?
      ORDER BY id DESC
    `)
    .all(req.user.id);

  res.json({
    expenses,
  });
});

router.get("/:id", (req, res) => {
  const expenseId = Number(req.params.id);

  if (!Number.isInteger(expenseId) || expenseId <= 0) {
    return res.status(400).json({
      error: "Invalid expense ID",
      message: "Expense ID must be a positive integer.",
    });
  }

  const expense = db
    .prepare(`
      SELECT id, description, amount, created_at
      FROM expenses
      WHERE id = ? AND user_id = ?
    `)
    .get(expenseId, req.user.id);

  if (!expense) {
    return res.status(404).json({
      error: "Expense not found",
      message: "The requested expense does not exist for this account.",
    });
  }

  res.json({
    expense,
  });
});

router.post("/", (req, res) => {
  const { description, amount } = req.body;
  const idempotencyKey = req.headers["idempotency-key"];

  if (!idempotencyKey || typeof idempotencyKey !== "string") {
    return res.status(400).json({
      error: "Missing Idempotency-Key",
      message: "Provide an Idempotency-Key header for this write request.",
    });
  }

  if (!description || typeof description !== "string") {
    return res.status(400).json({
      error: "Invalid description",
      message: "Description is required and must be a string.",
    });
  }

  if (
    typeof amount !== "number" ||
    !Number.isFinite(amount) ||
    amount <= 0
  ) {
    return res.status(400).json({
      error: "Invalid amount",
      message: "Amount must be a positive number.",
    });
  }

  const insert = db.prepare(`
    INSERT INTO expenses (
      user_id,
      description,
      amount,
      idempotency_key
    )
    VALUES (?, ?, ?, ?)
    ON CONFLICT(user_id, idempotency_key) DO NOTHING
  `);

  const result = insert.run(
    req.user.id,
    description.trim(),
    amount,
    idempotencyKey
  );

  const expense = db
    .prepare(`
      SELECT id, description, amount, created_at
      FROM expenses
      WHERE user_id = ? AND idempotency_key = ?
    `)
    .get(req.user.id, idempotencyKey);

  if (result.changes === 0) {
    return res.status(200).json({
      message: "Request already processed",
      expense,
    });
  }

  return res.status(201).json({
    message: "Expense created successfully",
    expense,
  });
});
router.delete("/:id", (req, res) => {
  const expenseId = Number(req.params.id);

  if (!Number.isInteger(expenseId) || expenseId <= 0) {
    return res.status(400).json({
      error: "Invalid expense ID",
      message: "Expense ID must be a positive integer.",
    });
  }

  const result = db
    .prepare(`
      DELETE FROM expenses
      WHERE id = ? AND user_id = ?
    `)
    .run(expenseId, req.user.id);

  if (result.changes === 0) {
    return res.status(404).json({
      error: "Expense not found",
      message: "The requested expense does not exist for this account.",
    });
  }

  return res.json({
    message: "Expense deleted successfully",
  });
});
module.exports = router;