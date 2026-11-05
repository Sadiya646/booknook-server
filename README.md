
# BookNook Server

Backend server for the BookNook online library application.

## Technologies
- Node.js
- Express.js
- MongoDB
- JWT Authentication

## Features
- Add, update, delete and view books.
- Borrow and return books.
- Manage book availability.
- Secure protected API routes.

## Installation

```bash
npm install
```

Create a `.env` file:

```env
PORT=8000
MONGODB_URL=your_mongodb_url
FRONTEND_URL=http://localhost:3000
```

Run the server:

```bash
npx nodemon index.js
```

## API Endpoints

| Method | Endpoint |
|---|---|
| GET | /books |
| GET | /books/:id |
| POST | /books |
| PATCH | /books/:id |
| DELETE | /books/:id |
| GET | /my-books |
| POST | /borrows |
| GET | /borrows |
| DELETE | /borrows/:id |

## Live Server

https://booknook-server-virid.vercel.app
