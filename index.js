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

// New middleware route for file upload
app.post('/api/upload', upload.single('file'), async (req, res) => {
  console.log('Upload route hit');

  try {
    const file = req.file;
    if (!file) return res.status(400).json({ error: 'No file uploaded' });

    console.log('File details:', {
      originalname: file.originalname,
      size: file.size,
      mimetype: file.mimetype,
    });

    // Generate AttachmentID
    const attachmentId = Date.now().toString();

    // Limit filename to 20 characters
    const limitedFileName = path.parse(file.originalname).name.slice(0, 20) + path.extname(file.originalname);

    // Start uploading to S3
    const s3Key = `documents/${attachmentId}_${limitedFileName}`;
    const s3Params = {
      Bucket: process.env.AWS_S3_BUCKET,
      Key: s3Key,
      Body: require('fs').createReadStream(file.path),
    };

    console.log('Uploading to S3 with parameters:', );

    s3.upload(s3Params, async (err, data) => {
      if (err) {
        console.error('Error uploading to S3:', );
        return res.status(500).json({ error: 'Error uploading to S3' });
      }

      // Construct the S3 URL
      const s3Url = `https://${process.env.AWS_S3_BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/${s3Key}`;
      console.log('S3 URL:', s3Url);
      // Prepare data for API call
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

      // Call external API using Axios
      try {
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
        console.log('Local file deleted');

        // Send success response
        res.status(200).json({ 
          message: 'File uploaded successfully', 
          s3Url: s3Url, 
          apiResponse: apiResponse.data 
        });

      } catch (apiError) {
        console.error('Error calling external API:', apiError);
        res.status(500).json({ error: 'Error calling external API' });
      }
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
