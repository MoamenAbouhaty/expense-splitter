# Expense Splitter API

A secure REST API for managing personal expenses.

The API provides user authentication, protected expense management, per-user data isolation, and idempotent write operations.

## Features

* User registration and login
* JWT-based authentication
* Password hashing with bcrypt
* Protected expense routes
* Per-user expense isolation
* Create, list, read, and delete expenses
* Idempotent expense creation
* Protection against concurrent duplicate requests
* Clear and descriptive error responses
* Automated tests with Jest and Supertest
* SQLite database with foreign-key constraints

## Tech Stack

* Node.js
* Express
* SQLite
* better-sqlite3
* JSON Web Tokens (JWT)
* bcrypt
* dotenv
* Jest
* Supertest

## Project Structure

```text
expense-splitter/
├── src/
│   ├── middleware/
│   │   └── auth.js
│   ├── routes/
│   │   ├── auth.js
│   │   └── expenses.js
│   ├── app.js
│   ├── db.js
│   └── server.js
├── tests/
│   ├── auth.test.js
│   └── expenses.test.js
├── .env
├── .gitignore
├── package.json
├── package-lock.json
└── README.md
```

## Installation

Clone the repository:

```bash
git clone YOUR_GITHUB_REPOSITORY_URL
cd expense-splitter
```

Install dependencies:

```bash
npm install
```

## Environment Variables

Create a `.env` file in the project root:

```env
PORT=3000
JWT_SECRET=replace-with-a-secure-secret
```

Do not commit the `.env` file.

The `.env` file is excluded through `.gitignore`.

## Running the API

Start the server:

```bash
npm start
```

The API will run on:

```text
http://localhost:3000
```

For development:

```bash
npm run dev
```

## Health Check

### Request

```http
GET /health
```

Example:

```bash
curl http://localhost:3000/health
```

### Response

```json
{
  "status": "ok"
}
```

---

# Authentication

The API uses JWT authentication for protected routes.

## Register

### Endpoint

```http
POST /api/auth/register
```

### Request

```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"Password123"}'
```

### Example Response

```json
{
  "message": "Account created successfully",
  "user": {
    "id": 1,
    "email": "user@example.com"
  }
}
```

Passwords must contain at least 8 characters.

## Login

### Endpoint

```http
POST /api/auth/login
```

### Request

```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"Password123"}'
```

### Example Response

```json
{
  "message": "Login successful",
  "token": "<JWT_TOKEN>",
  "user": {
    "id": 1,
    "email": "user@example.com"
  }
}
```

Use the returned JWT for protected routes:

```text
Authorization: Bearer <JWT_TOKEN>
```

---

# Expense API

All expense endpoints require authentication.

## List Expenses

### Endpoint

```http
GET /api/expenses
```

### Request

```bash
curl http://localhost:3000/api/expenses \
  -H "Authorization: Bearer <JWT_TOKEN>"
```

### Response

```json
{
  "expenses": [
    {
      "id": 1,
      "description": "Internet bill",
      "amount": 500,
      "created_at": "2026-10-04 10:00:00"
    }
  ]
}
```

Only expenses belonging to the authenticated user are returned.

---

## Get One Expense

### Endpoint

```http
GET /api/expenses/:id
```

### Request

```bash
curl http://localhost:3000/api/expenses/1 \
  -H "Authorization: Bearer <JWT_TOKEN>"
```

### Response

```json
{
  "expense": {
    "id": 1,
    "description": "Internet bill",
    "amount": 500,
    "created_at": "2026-10-04 10:00:00"
  }
}
```

The API only returns the expense if it belongs to the authenticated user.

---

## Create Expense

### Endpoint

```http
POST /api/expenses
```

Creating an expense requires an `Idempotency-Key` header.

### Request

```bash
curl -X POST http://localhost:3000/api/expenses \
  -H "Authorization: Bearer <JWT_TOKEN>" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: expense-001" \
  -d '{"description":"Internet bill","amount":500}'
```

### Response

```json
{
  "message": "Expense created successfully",
  "expense": {
    "id": 1,
    "description": "Internet bill",
    "amount": 500,
    "created_at": "2026-10-04 10:00:00"
  }
}
```

The amount must be a positive number.

---

## Delete Expense

### Endpoint

```http
DELETE /api/expenses/:id
```

### Request

```bash
curl -X DELETE http://localhost:3000/api/expenses/1 \
  -H "Authorization: Bearer <JWT_TOKEN>"
```

### Response

```json
{
  "message": "Expense deleted successfully"
}
```

A user can only delete their own expenses.

---

# Authentication Protection

Protected routes reject requests without valid credentials.

For example:

```bash
curl http://localhost:3000/api/expenses
```

Response:

```http
401 Unauthorized
```

```json
{
  "error": "Authentication required",
  "message": "Provide a valid Bearer token in the Authorization header."
}
```

Invalid or expired tokens also return:

```http
401 Unauthorized
```

```json
{
  "error": "Invalid authentication token",
  "message": "Provide a valid and non-expired Bearer token."
}
```

This behavior is covered by the automated test suite.

---

# User Data Isolation

Each expense is associated with the authenticated user's ID:

```text
expenses.user_id -> users.id
```

The API always scopes expense queries to the authenticated user.

For example, retrieving an expense uses both the expense ID and the authenticated user ID:

```sql
SELECT id, description, amount, created_at
FROM expenses
WHERE id = ? AND user_id = ?
```

This prevents one user from accessing another user's expense.

## Read Isolation

If User A creates an expense, User B cannot retrieve it.

User B receives:

```http
404 Not Found
```

```json
{
  "error": "Expense not found",
  "message": "The requested expense does not exist for this account."
}
```

## Write Isolation

User B also cannot delete User A's expense.

The delete operation uses:

```sql
DELETE FROM expenses
WHERE id = ? AND user_id = ?
```

Therefore, a user cannot modify another user's expense by knowing its ID.

These behaviors are verified by automated tests.

---

# Idempotency

The expense creation endpoint is designed to be safe to retry.

Every create request requires an `Idempotency-Key` header.

Example:

```text
Idempotency-Key: expense-001
```

The database defines the following constraint:

```sql
UNIQUE(user_id, idempotency_key)
```

The insert operation uses:

```sql
ON CONFLICT(user_id, idempotency_key) DO NOTHING
```

This makes the database responsible for preventing duplicate records for the same authenticated user and idempotency key.

## Retry Behavior

The first request:

```text
POST /api/expenses
Idempotency-Key: expense-001
```

returns:

```http
201 Created
```

If the exact request is retried using the same user and the same idempotency key, the existing expense is returned:

```http
200 OK
```

The expense ID remains the same.

Example:

```text
First request:
201 Created
Expense ID: 1

Retry:
200 OK
Expense ID: 1
```

The database still contains only one expense.

---

# Concurrent Requests

Idempotency is also tested with concurrent requests.

Two requests are sent at the same time using the same authenticated user and the same idempotency key:

```text
Request A:
Idempotency-Key: concurrent-test-001

Request B:
Idempotency-Key: concurrent-test-001
```

The database constraint guarantees that only one row is created.

The test verifies:

```text
Database rows with the same user and idempotency key: 1
```

This demonstrates that the implementation does not merely check for duplicates in application code; the database constraint provides the final uniqueness guarantee.

---

# Error Handling

The API returns JSON responses that explain what went wrong.

## Missing Authentication

```http
401 Unauthorized
```

```json
{
  "error": "Authentication required",
  "message": "Provide a valid Bearer token in the Authorization header."
}
```

## Invalid Authentication Token

```http
401 Unauthorized
```

```json
{
  "error": "Invalid authentication token",
  "message": "Provide a valid and non-expired Bearer token."
}
```

## Invalid Expense ID

```http
400 Bad Request
```

```json
{
  "error": "Invalid expense ID",
  "message": "Expense ID must be a positive integer."
}
```

## Missing Idempotency Key

```http
400 Bad Request
```

```json
{
  "error": "Missing Idempotency-Key",
  "message": "Provide an Idempotency-Key header for this write request."
}
```

## Invalid Amount

```http
400 Bad Request
```

```json
{
  "error": "Invalid amount",
  "message": "Amount must be a positive number."
}
```

## Expense Not Found

```http
404 Not Found
```

```json
{
  "error": "Expense not found",
  "message": "The requested expense does not exist for this account."
}
```

## Duplicate Registration

```http
409 Conflict
```

```json
{
  "error": "Email already registered",
  "message": "Use a different email address."
}
```

## Unknown Route

```http
404 Not Found
```

```json
{
  "error": "Route not found",
  "message": "No route exists for GET /unknown."
}
```

---

# Automated Tests

Run the test suite with:

```bash
npm test
```

Current result:

```text
PASS  tests/expenses.test.js
PASS  tests/auth.test.js

Test Suites: 2 passed, 2 total
Tests:       5 passed, 5 total
Snapshots:   0 total
Time:        2.547 s
Ran all test suites.
```

The tests verify:

* Protected routes reject unauthenticated requests
* User A cannot read User B's expense
* User B cannot delete User A's expense
* Repeated requests with the same idempotency key return the first result
* Concurrent requests with the same idempotency key create only one expense

---

# Test Details

## Authentication Test

The test sends a request to the protected expenses endpoint without an Authorization header.

Expected result:

```text
401 Unauthorized
```

## User Isolation Test

The test creates an expense using User A's token.

It then attempts to retrieve the same expense using User B's token.

Expected result:

```text
404 Not Found
```

## Delete Authorization Test

The test creates an expense for User A.

User B attempts to delete the expense.

Expected result:

```text
404 Not Found
```

The test also verifies that the database record still exists.

## Idempotency Test

The same create request is sent twice with the same idempotency key.

Expected results:

```text
First request: 201 Created
Second request: 200 OK
```

The database is verified to contain exactly one expense.

## Concurrent Idempotency Test

Two create requests are sent concurrently using the same idempotency key.

Expected result:

```text
Only one database row is created.
```

---

# Security

The application includes several security measures:

* Passwords are hashed with bcrypt
* Password hashes are never returned by the API
* Protected routes require JWT authentication
* JWT tokens expire after one hour
* Expense queries are scoped to the authenticated user
* SQLite foreign keys are enabled
* Duplicate writes are protected by a database uniqueness constraint
* Secrets are stored in environment variables
* `.env` is excluded from Git
* Database files are excluded from Git

---

# Environment and Secrets

The following file must never be committed:

```text
.env
```

The repository uses `.gitignore` to exclude:

```text
node_modules/
.env
*.db
*.sqlite
coverage/
```

The production `JWT_SECRET` should be a strong randomly generated secret and must be configured through the deployment platform's environment variables.

---

# API Summary

| Method | Endpoint             | Authentication | Description                   |
| ------ | -------------------- | -------------- | ----------------------------- |
| GET    | `/health`            | No             | Health check                  |
| POST   | `/api/auth/register` | No             | Create an account             |
| POST   | `/api/auth/login`    | No             | Login and receive JWT         |
| GET    | `/api/expenses`      | Yes            | List current user's expenses  |
| GET    | `/api/expenses/:id`  | Yes            | Get current user's expense    |
| POST   | `/api/expenses`      | Yes            | Create an expense             |
| DELETE | `/api/expenses/:id`  | Yes            | Delete current user's expense |

---

# Deployment

Public API:

```text
YOUR_DEPLOYED_API_URL
```

Health check:

```text
YOUR_DEPLOYED_API_URL/health
```

Repository:

```text
YOUR_GITHUB_REPOSITORY_URL
```

The deployed service must have the following environment variables configured:

```text
PORT
JWT_SECRET
```

The production `JWT_SECRET` should not be committed to the repository.

---

# Reviewer Verification

A reviewer can verify the required behaviors using the following checks.

## 1. Public API

Open:

```text
YOUR_DEPLOYED_API_URL/health
```

Expected:

```json
{
  "status": "ok"
}
```

## 2. Protected Route

Send a request without credentials:

```bash
curl YOUR_DEPLOYED_API_URL/api/expenses
```

Expected:

```text
401 Unauthorized
```

## 3. User Isolation

Create two users.

Authenticate as User A and create an expense.

Then authenticate as User B and attempt to access User A's expense.

Expected:

```text
404 Not Found
```

User B must not be able to read or delete User A's expense.

## 4. Idempotency

Send the same expense creation request twice using the same `Idempotency-Key`.

Expected:

```text
First request: 201 Created
Second request: 200 OK
```

Both responses should reference the same expense ID.

## 5. Automated Tests

Run:

```bash
npm test
```

Expected:

```text
Test Suites: 2 passed, 2 total
Tests:       5 passed, 5 total
```

---

# License

This project is provided for educational and demonstration purposes.
