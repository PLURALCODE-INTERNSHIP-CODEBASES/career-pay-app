import express from "express"
import connectDB from "./config/db.js";
import "dotenv/config"

// Initialize Express
const app = express()

// Connect Database
await connectDB();

// Routes
app.get('/', (req,res) => {
    res.json({ message: "CarrerPay API is running and in Development" })
})


// PORT
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});


