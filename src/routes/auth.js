const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const db = require("../db");

const router = express.Router();

router.post("/register", async (req, res) => {
  const { email, password } = req.body;

  if (!email || typeof email !== "string") {
    return res.status(400).json({
      error: "Invalid email",
      message: "Email is required and must be a string.",
    });
  }

  if (!password || typeof password !== "string") {
    return res.status(400).json({
      error: "Invalid password",
      message: "Password is required and must be a string.",
    });
  }

  if (password.length < 8) {
    return res.status(400).json({
      error: "Invalid password",
      message: "Password must be at least 8 characters long.",
    });
  }

  const normalizedEmail = email.trim().toLowerCase();

  const existingUser = db
    .prepare("SELECT id FROM users WHERE email = ?")
    .get(normalizedEmail);

  if (existingUser) {
    return res.status(409).json({
      error: "Email already registered",
      message: "Use a different email address.",
    });
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const result = db
    .prepare(
      "INSERT INTO users (email, password_hash) VALUES (?, ?)"
    )
    .run(normalizedEmail, passwordHash);

  return res.status(201).json({
    message: "Account created successfully",
    user: {
      id: result.lastInsertRowid,
      email: normalizedEmail,
    },
  });
});

router.post("/login", async (req, res) => {
  const { email, password } = req.body;

  if (!email || typeof email !== "string") {
    return res.status(400).json({
      error: "Invalid email",
      message: "Email is required and must be a string.",
    });
  }

  if (!password || typeof password !== "string") {
    return res.status(400).json({
      error: "Invalid password",
      message: "Password is required and must be a string.",
    });
  }

  const normalizedEmail = email.trim().toLowerCase();

  const user = db
    .prepare(
      "SELECT id, email, password_hash FROM users WHERE email = ?"
    )
    .get(normalizedEmail);

  if (!user) {
    return res.status(401).json({
      error: "Invalid credentials",
      message: "Email or password is incorrect.",
    });
  }

  const passwordMatches = await bcrypt.compare(
    password,
    user.password_hash
  );

  if (!passwordMatches) {
    return res.status(401).json({
      error: "Invalid credentials",
      message: "Email or password is incorrect.",
    });
  }

  const token = jwt.sign(
    {
      userId: user.id,
    },
    process.env.JWT_SECRET,
    {
      expiresIn: "1h",
    }
  );

  return res.json({
    message: "Login successful",
    token,
    user: {
      id: user.id,
      email: user.email,
    },
  });
});

module.exports = router;