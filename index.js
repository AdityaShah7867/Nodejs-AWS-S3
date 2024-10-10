const express = require('express');
const mongoose = require('mongoose');
const multer = require('multer');
const AWS = require('aws-sdk');
const dotenv = require('dotenv');
const path = require('path');
const cors = require('cors'); // Add this line
const nodemailer = require('nodemailer'); // Add this line

dotenv.config();

const app = express();
app.use(express.json());
app.use(cors()); // Add this line to enable CORS

// MongoDB connection
mongoose.connect(process.env.MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true });

// AWS S3 configuration
const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION
});

// Multer configuration for file upload
const upload = multer({ dest: 'uploads/' });

// MongoDB schemas
const DocumentSchema = new mongoose.Schema({
  name: String,
  s3Key: String,
  size: Number,
  type: String,
  s3Url: String,  // Add this line to store the S3 URL`
});

const ChecklistItemSchema = new mongoose.Schema({
  name: String,
  status: String,
  documents: [DocumentSchema]
});

const ChecklistGroupSchema = new mongoose.Schema({
  name: String,
  items: [ChecklistItemSchema]
});

const ChecklistGroup = mongoose.model('ChecklistGroup', ChecklistGroupSchema);

// API routes

// Create a checklist group
app.post('/api/groups', async (req, res) => {
  try {
    const group = new ChecklistGroup({ name: req.body.name, items: [] });
    await group.save();
    res.status(201).json(group);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Create a checklist item in a group
app.post('/api/groups/:groupId/items', async (req, res) => {
  try {
    const group = await ChecklistGroup.findById(req.params.groupId);
    if (!group) return res.status(404).json({ error: 'Group not found' });

    const newItem = {
      name: req.body.name,
      status: req.body.status || 'Open',
      documents: []
    };

    group.items.push(newItem);
    await group.save();
    res.status(201).json(newItem);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Upload a document to an item and store in S3
// Upload a document to an item and store in S3
// Upload a document to an item and store in S3
// Upload a document to an item and store in S3
app.post('/api/groups/:groupId/items/:itemId/documents', upload.single('file'), async (req, res) => {
    console.log('Upload route hit');
  
    try {
      const group = await ChecklistGroup.findById(req.params.groupId);
      if (!group) return res.status(404).json({ error: 'Group not found' });
  
      const item = group.items.id(req.params.itemId);
      if (!item) return res.status(404).json({ error: 'Item not found' });
  
      const file = req.file;
      if (!file) return res.status(400).json({ error: 'No file uploaded' });
  
      console.log('File details:', {
        originalname: file.originalname,
        size: file.size,
        mimetype: file.mimetype,
      });
  
      // Send immediate response
      res.status(202).json({ message: 'File received, uploading to S3...' });
  
      // Start uploading to S3
      const s3Key = `documents/${Date.now()}_${path.basename(file.originalname)}`;
      const s3Params = {
        Bucket: process.env.AWS_S3_BUCKET,
        Key: s3Key,
        Body: require('fs').createReadStream(file.path),
      };
  
      console.log('Uploading to S3 with parameters:');
  
      s3.upload(s3Params, async (err, data) => {
        if (err) {
          console.error('Error uploading to S3:', err);
          return; // Handle error appropriately (e.g., log it)
        }
  
        // Construct the S3 URL
        const s3Url = `https://${process.env.AWS_S3_BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/${s3Key}`;
  
        const document = {
          name: file.originalname,
          s3Key: s3Key,
          s3Url: s3Url,
          size: file.size,
          type: file.mimetype,
        };
  
        item.documents.push(document);
        await group.save();
  
        // console.log('Document saved to item:', document);
  
        // Clean up the local file
        require('fs').unlinkSync(file.path);
        console.log('Local file deleted');
  
        // Send email notification (using Nodemailer)
        const transporter = nodemailer.createTransport({
          service: 'gmail', // or your email service
          auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS,
          },
        });
  
        const mailOptions = {
          from: process.env.EMAIL_USER,
          to: '192105adityashah@gmail.com', // email from the request body
          subject: 'File Upload Notification',
          text: `Your file "${file.originalname}" has been successfully uploaded to S3. You can access it at ${s3Url}`,
        };
  
        transporter.sendMail(mailOptions, (error, info) => {
          if (error) {
            console.error('Error sending email:', error);
          } else {
            console.log('Email sent:', info.response);
          }
        });
      });
    } catch (error) {
      console.error('Error in upload route:', error);
      res.status(400).json({ error: error.message });
    }
  });
  
  
  
  

// Get all checklist groups
app.get('/api/groups', async (req, res) => {
  try {
    const groups = await ChecklistGroup.find();
    res.json(groups);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});