const express = require('express');
const mongoose = require('mongoose');
const multer = require('multer');
const AWS = require('aws-sdk');
const dotenv = require('dotenv');
const path = require('path');
const cors = require('cors'); // Add this line
const nodemailer = require('nodemailer'); // Add this line
const axios = require('axios');

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
const upload = multer({ dest: 'uploads/' }).array('files', 10); // Allow up to 10 files

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

// New middleware route for file upload
app.post('/api/upload', upload, async (req, res) => {
  console.log('Upload route hit');

  const files = req.files;
  if (!files || files.length === 0) return res.status(400).json({ error: 'No files uploaded' });

  console.log(`Received ${files.length} files`);

  // Immediately respond to the frontend
  res.status(202).json({ message: `${files.length} files received. Processing started.` });

  // Process files in the background
  processFiles(files).catch(error => console.error('Error in background processing:', error));
});

async function processFiles(files) {
  const uploadResults = [];

  for (const file of files) {
    try {
      console.log('Processing file:', file.originalname);

      const attachmentId = Date.now().toString();
      const limitedFileName = path.parse(file.originalname).name.slice(0, 20) + path.extname(file.originalname);
      const s3Key = `documents/${attachmentId}_${limitedFileName}`;

      // Upload to S3
      const s3Params = {
        Bucket: process.env.AWS_S3_BUCKET,
        Key: s3Key,
        Body: require('fs').createReadStream(file.path),
      };

      const data = await s3.upload(s3Params).promise();
      const s3Url = `https://${process.env.AWS_S3_BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/${s3Key}`;

      // Prepare and send data to external API
      const apiData = {
        AttachmentDetailID: "0",
        AttachmentID: attachmentId,
        FileName: limitedFileName,
        DisplayName: path.parse(limitedFileName).name,
        FileUrl: s3Url,
        FileSize: file.size.toString(),
        FileType: file.mimetype.split('/')[0],
        FileExtension: path.extname(file.originalname).substr(1),
        SortOrder: "1",
        Status: "1",
        ChangedBy: "1"
      };

      const apiResponse = await axios.post('https://api.abcditsolutions.com/AMSAPI/', 
        {
          actionname: "AttachmentDetailSave",
          jsondata: JSON.stringify(apiData),
          multipletable: false
        },
        {
          headers: {
            'access_token': 'KSDISLRERFMFSOT123323DSF3444FS123456SDFSSFF'
          }
        }
      );

      console.log('API response:', apiResponse.data);

      // Clean up the local file
      require('fs').unlinkSync(file.path);
      console.log('Local file deleted:', file.originalname);

      uploadResults.push({
        originalName: file.originalname,
        s3Url: s3Url,
        apiResponse: apiResponse.data
      });

    } catch (error) {
      console.error('Error processing file:', file.originalname, error);
      uploadResults.push({
        originalName: file.originalname,
        error: error.message
      });
    }
  }

  console.log('All files processed. Results:', uploadResults);
  // Here you could implement additional logic to notify the frontend of completion,
  // such as websockets, server-sent events, or updating a status in a database
}

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
