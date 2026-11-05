
import express from "express";
import dotenv from "dotenv";
import { MongoClient, ObjectId } from "mongodb";
import cors from "cors";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import { jwtVerify, createRemoteJWKSet } from "jose";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 8000;

const FRONTEND_URL = (
  process.env.FRONTEND_URL || "http://localhost:3000"
).replace(/\/$/, "");

const MONGODB_URL = process.env.MONGODB_URL;

if (!MONGODB_URL) {
  throw new Error("MONGODB_URL is missing in environment variables.");
}

// =====================================
// SECURITY CONFIGURATION
// =====================================

const allowedOrigins = [
  "http://localhost:3000",
  "https://booknook-pied.vercel.app",
];

if (FRONTEND_URL && !allowedOrigins.includes(FRONTEND_URL)) {
  allowedOrigins.push(FRONTEND_URL);
}

// =====================================
// RATE LIMITING
// =====================================

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 100,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: {
    message: "Too many requests. Please try again later.",
  },
});

// =====================================
// MIDDLEWARE
// =====================================

app.use(helmet());

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      return callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
  })
);

app.use(express.json({ limit: "100kb" }));

app.use(apiLimiter);

// =====================================
// MONGODB
// =====================================

const client = new MongoClient(MONGODB_URL);

let booksCollection;
let borrowingsCollection;

// =====================================
// BETTER AUTH JWT VERIFICATION
// =====================================

const JWKS = createRemoteJWKSet(
  new URL(`${FRONTEND_URL}/api/auth/jwks`)
);

async function verifyToken(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader?.startsWith("Bearer ")) {
      return res.status(401).send({
        message: "Unauthorized request. Please login.",
      });
    }

    const token = authHeader.slice(7).trim();

    if (!token) {
      return res.status(401).send({
        message: "Invalid token.",
      });
    }

    const { payload } = await jwtVerify(token, JWKS, {
      issuer: FRONTEND_URL,
      audience: FRONTEND_URL,
    });

    if (!payload.email || typeof payload.email !== "string") {
      return res.status(401).send({
        message: "Invalid user token.",
      });
    }

    req.user = {
      id: payload.sub || payload.id,
      email: payload.email.trim().toLowerCase(),
      name: payload.name || "",
    };

    next();
  } catch (error) {
    console.error("JWT verification error:", error.message);

    return res.status(401).send({
      message: "Invalid or expired token.",
    });
  }
}

// =====================================
// COMMON VALIDATION
// =====================================

const allowedCategories = [
  "Fiction",
  "Science",
  "History",
  "Kids",
  "Others",
];

function validBookData(data) {
  const {
    title,
    author,
    category,
    description,
    imageUrl,
    totalCopies,
  } = data;

  const total = Number(totalCopies);

  let validImageUrl = false;

  try {
    const parsedUrl = new URL(imageUrl);

    validImageUrl =
      parsedUrl.protocol === "http:" ||
      parsedUrl.protocol === "https:";
  } catch {
    validImageUrl = false;
  }

  return (
    typeof title === "string" &&
    title.trim().length > 0 &&
    title.trim().length <= 150 &&
    typeof author === "string" &&
    author.trim().length > 0 &&
    author.trim().length <= 100 &&
    allowedCategories.includes(category) &&
    typeof description === "string" &&
    description.trim().length > 0 &&
    description.trim().length <= 3000 &&
    validImageUrl &&
    Number.isSafeInteger(total) &&
    total >= 1 &&
    total <= 10000
  );
}

// =====================================
// HOME
// =====================================

app.get("/", (req, res) => {
  res.send("BookNook Server is Running");
});

// =====================================
// ADD BOOK
// =====================================

app.post("/add-book", verifyToken, async (req, res) => {
  try {
    if (!validBookData(req.body)) {
      return res.status(400).send({
        message: "Please provide valid book information.",
      });
    }

    const {
      title,
      author,
      category,
      description,
      imageUrl,
      totalCopies,
    } = req.body;

    const total = Number(totalCopies);

    const book = {
      title: title.trim(),
      author: author.trim(),
      category,
      description: description.trim(),
      imageUrl: imageUrl.trim(),
      totalCopies: total,
      copies: total,
      userName: req.user.name,
      userEmail: req.user.email,
      createdAt: new Date(),
    };

    const result = await booksCollection.insertOne(book);

    res.status(201).send({
      message: "Book added successfully!",
      insertedId: result.insertedId,
    });
  } catch (error) {
    console.error("Add book error:", error);

    res.status(500).send({
      message: "Failed to add book",
    });
  }
});

// =====================================
// GET ALL BOOKS
// =====================================

app.get("/books", async (req, res) => {
  try {
    const books = await booksCollection
      .find()
      .sort({ createdAt: -1 })
      .toArray();

    res.status(200).send(books);
  } catch (error) {
    console.error("Get books error:", error);

    res.status(500).send({
      message: "Failed to get books",
    });
  }
});

// =====================================
// GET SINGLE BOOK
// =====================================

app.get("/books/:id", async (req, res) => {
  try {
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).send({
        message: "Invalid book ID",
      });
    }

    const book = await booksCollection.findOne({
      _id: new ObjectId(id),
    });

    if (!book) {
      return res.status(404).send({
        message: "Book not found",
      });
    }

    res.status(200).send(book);
  } catch (error) {
    console.error("Get single book error:", error);

    res.status(500).send({
      message: "Failed to get book",
    });
  }
});

// =====================================
// MY BOOKS
// =====================================

app.get("/my-books", verifyToken, async (req, res) => {
  try {
    const books = await booksCollection
      .find({
        userEmail: req.user.email,
      })
      .sort({ createdAt: -1 })
      .toArray();

    res.status(200).send(books);
  } catch (error) {
    console.error("My books error:", error);

    res.status(500).send({
      message: "Failed to get your books",
    });
  }
});

// =====================================
// UPDATE MY BOOK
// =====================================

app.put("/my-books/:id", verifyToken, async (req, res) => {
  try {
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).send({
        message: "Invalid book ID",
      });
    }

    if (!validBookData(req.body)) {
      return res.status(400).send({
        message: "Please provide valid book information.",
      });
    }

    const {
      title,
      author,
      category,
      description,
      imageUrl,
      totalCopies,
    } = req.body;

    const newTotal = Number(totalCopies);
    const bookId = new ObjectId(id);

    const book = await booksCollection.findOne({
      _id: bookId,
      userEmail: req.user.email,
    });

    if (!book) {
      return res.status(404).send({
        message: "Book not found or you do not own this book.",
      });
    }

    const oldTotal = Number(book.totalCopies ?? book.copies ?? 0);
    const oldAvailable = Number(book.copies ?? oldTotal);

    const borrowedCopies = oldTotal - oldAvailable;
    const newAvailable = newTotal - borrowedCopies;

    if (newAvailable < 0) {
      return res.status(400).send({
        message: `You cannot set total copies below ${borrowedCopies} borrowed copies.`,
      });
    }

    const result = await booksCollection.updateOne(
      {
        _id: bookId,
        userEmail: req.user.email,
        copies: oldAvailable,
        totalCopies: oldTotal,
      },
      {
        $set: {
          title: title.trim(),
          author: author.trim(),
          category,
          description: description.trim(),
          imageUrl: imageUrl.trim(),
          totalCopies: newTotal,
          copies: newAvailable,
        },
      }
    );

    if (result.modifiedCount === 0) {
      return res.status(409).send({
        message: "Book changed. Please refresh and try again.",
      });
    }

    res.status(200).send({
      message: "Book updated successfully!",
    });
  } catch (error) {
    console.error("Update book error:", error);

    res.status(500).send({
      message: "Failed to update book",
    });
  }
});

// =====================================
// DELETE MY BOOK
// =====================================

app.delete("/my-books/:id", verifyToken, async (req, res) => {
  try {
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).send({
        message: "Invalid book ID",
      });
    }

    const bookId = new ObjectId(id);

    const book = await booksCollection.findOne({
      _id: bookId,
      userEmail: req.user.email,
    });

    if (!book) {
      return res.status(404).send({
        message: "Book not found or you do not own this book.",
      });
    }

    const activeBorrowing = await borrowingsCollection.findOne({
      bookId,
      status: "borrowed",
    });

    if (activeBorrowing) {
      return res.status(400).send({
        message: "This book cannot be deleted while it is borrowed.",
      });
    }

    await booksCollection.deleteOne({
      _id: bookId,
      userEmail: req.user.email,
    });

    res.status(200).send({
      message: "Book deleted successfully!",
    });
  } catch (error) {
    console.error("Delete book error:", error);

    res.status(500).send({
      message: "Failed to delete book",
    });
  }
});

// =====================================
// BORROW BOOK - TRANSACTION
// =====================================

app.post("/borrow", verifyToken, async (req, res) => {
  const session = client.startSession();

  try {
    const { bookId } = req.body;

    if (!bookId || !ObjectId.isValid(bookId)) {
      return res.status(400).send({
        message: "Invalid book ID",
      });
    }

    let borrowingId;

    await session.withTransaction(async () => {
      const bookObjectId = new ObjectId(bookId);

      const existingBorrowing = await borrowingsCollection.findOne(
        {
          bookId: bookObjectId,
          borrowerEmail: req.user.email,
          status: "borrowed",
        },
        { session }
      );

      if (existingBorrowing) {
        throw new Error("ALREADY_BORROWED");
      }

      const book = await booksCollection.findOne(
        { _id: bookObjectId },
        { session }
      );

      if (!book) {
        throw new Error("BOOK_NOT_FOUND");
      }

      const updateResult = await booksCollection.updateOne(
        {
          _id: bookObjectId,
          copies: { $gt: 0 },
        },
        {
          $inc: { copies: -1 },
        },
        { session }
      );

      if (updateResult.modifiedCount === 0) {
        throw new Error("BOOK_UNAVAILABLE");
      }

      const borrowDate = new Date();
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + 7);

      const borrowing = {
        bookId: bookObjectId,
        bookTitle: book.title,
        bookAuthor: book.author || "",
        bookImage: book.imageUrl || book.image || "",
        borrowerName: req.user.name,
        borrowerEmail: req.user.email,
        borrowDate,
        dueDate,
        status: "borrowed",
      };

      const result = await borrowingsCollection.insertOne(
        borrowing,
        { session }
      );

      borrowingId = result.insertedId;
    });

    res.status(201).send({
      message: "Book borrowed successfully!",
      borrowingId,
    });
  } catch (error) {
    if (error.message === "ALREADY_BORROWED" || error.code === 11000) {
      return res.status(400).send({
        message: "You have already borrowed this book.",
      });
    }

    if (error.message === "BOOK_UNAVAILABLE") {
      return res.status(400).send({
        message: "This book is currently unavailable.",
      });
    }

    if (error.message === "BOOK_NOT_FOUND") {
      return res.status(404).send({
        message: "Book not found",
      });
    }

    console.error("Borrow transaction error:", error);

    res.status(500).send({
      message: "Failed to borrow book",
    });
  } finally {
    await session.endSession();
  }
});

// =====================================
// MY BORROWED BOOKS
// =====================================

app.get("/my-borrows", verifyToken, async (req, res) => {
  try {
    const borrowings = await borrowingsCollection
      .find({
        borrowerEmail: req.user.email,
        status: "borrowed",
      })
      .sort({ borrowDate: -1 })
      .toArray();

    res.status(200).send(borrowings);
  } catch (error) {
    console.error("My borrows error:", error);

    res.status(500).send({
      message: "Failed to get borrowed books",
    });
  }
});

// =====================================
// RETURN BOOK - TRANSACTION
// =====================================

app.patch("/return/:id", verifyToken, async (req, res) => {
  const session = client.startSession();

  try {
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).send({
        message: "Invalid borrowing ID",
      });
    }

    const borrowingId = new ObjectId(id);

    await session.withTransaction(async () => {
      const borrowing = await borrowingsCollection.findOne(
        {
          _id: borrowingId,
          borrowerEmail: req.user.email,
          status: "borrowed",
        },
        { session }
      );

      if (!borrowing) {
        throw new Error("BORROWING_NOT_FOUND");
      }

      const book = await booksCollection.findOne(
        { _id: borrowing.bookId },
        { session }
      );

      if (!book) {
        throw new Error("BOOK_NOT_FOUND");
      }

      const updateResult = await borrowingsCollection.updateOne(
        {
          _id: borrowingId,
          borrowerEmail: req.user.email,
          status: "borrowed",
        },
        {
          $set: {
            status: "returned",
            returnedAt: new Date(),
          },
        },
        { session }
      );

      if (updateResult.modifiedCount === 0) {
        throw new Error("RETURN_FAILED");
      }

      await booksCollection.updateOne(
        { _id: borrowing.bookId },
        {
          $inc: { copies: 1 },
        },
        { session }
      );
    });

    res.status(200).send({
      message: "Book returned successfully!",
    });
  } catch (error) {
    if (error.message === "BORROWING_NOT_FOUND") {
      return res.status(404).send({
        message: "Borrowing record not found.",
      });
    }

    if (error.message === "BOOK_NOT_FOUND") {
      return res.status(404).send({
        message: "Book not found.",
      });
    }

    if (error.message === "RETURN_FAILED") {
      return res.status(400).send({
        message: "Book return failed.",
      });
    }

    console.error("Return transaction error:", error);

    res.status(500).send({
      message: "Failed to return book",
    });
  } finally {
    await session.endSession();
  }
});

// =====================================
// START SERVER
// =====================================

async function startServer() {
  try {
    await client.connect();

    console.log("Successfully connected to MongoDB!");

    const database = client.db("bookstore");

    booksCollection = database.collection("books");
    borrowingsCollection = database.collection("borrowings");

    // Prevent duplicate active borrowing records
    await borrowingsCollection.createIndex(
      {
        bookId: 1,
        borrowerEmail: 1,
      },
      {
        unique: true,
        partialFilterExpression: {
          status: "borrowed",
        },
      }
    );

    console.log("Borrowing index created successfully!");

    app.listen(PORT, () => {
      console.log(`BookNook server running on port ${PORT}`);
    });
  } catch (error) {
    console.error("Server startup failed:", error);
    process.exit(1);
  }
}

startServer();
