import express from "express"
import connectDB from "./config/db.js";
import "dotenv/config"

// Initialize Express
const app = express()

// Connect Database
await connectDB();

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

app.get('/', (req,res) => {
    res.send(`Server is Running on ${PORT}`)
})
