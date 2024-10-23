const express = require('express');
const multer = require('multer');
const AWS = require('aws-sdk');
const axios = require('axios');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config();

const app = express();
app.use(express.json());
app.use(cors());

// Configure AWS S3
const s3 = new AWS.S3({
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    region: process.env.AWS_REGION,
});

// Configure Multer for file uploads
const upload = multer({ dest: 'uploads/' }).array('files', 10);

// Route to handle new and existing files
app.post('/api/upload-or-update', upload, async (req, res) => {
    const { existingData = '[]', AttachmentID, FolderPath } = req.body;
    const newFiles = req.files;

    // Handle existing data, if provided
    let uploadResults = [];
    try {
        if (existingData) {
            uploadResults = JSON.parse(existingData);
        }
    } catch (error) {
        console.error('JSON Parse Error:', error);
        return res.status(400).json({ error: 'Invalid JSON in existingData' });
    }

    // Process new files
    for (const file of newFiles) {
        const s3Key = `${FolderPath}/${Date.now()}_${file.originalname}`;
        const s3Params = {
            Bucket: process.env.AWS_S3_BUCKET,
            Key: s3Key,
            Body: fs.createReadStream(file.path),
        };

        try {
            const s3Data = await s3.upload(s3Params).promise();
            const s3Url = `https://${process.env.AWS_S3_BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/${s3Key}`;

            // Add new file details to the upload results
            uploadResults.push({
                AttachmentDetailID: "0",
                AttachmentID: AttachmentID,
                FileName: file.originalname,
                DisplayName: path.parse(file.originalname).name,
                FileUrl: s3Url,
                FileSize: file.size,
                FileType: file.mimetype.split('/')[0],
                FileExtension: path.extname(file.originalname).slice(1),
                SortOrder: 1,
                Status: 1,
                ChangedBy: 1  // You might want to replace this with the actual user ID
            });

            // Clean up local file after upload
            fs.unlinkSync(file.path);
        } catch (error) {
            console.error('S3 Upload Error:', error);
            return res.status(500).json({ error: 'Failed to upload file to S3' });
        }
    }

    // Send the combined data to the PHP backend
    try {
        console.log('Sending data to PHP backend:', JSON.stringify(uploadResults));
        const response = await axios.post(
            'https://api.abcditsolutions.com/AMSAPI/',
            {
                actionname: "AttachmentDetailSave",
                jsondata: JSON.stringify(uploadResults),
                multipletable: false,
            },
            { headers: { 'access_token': process.env.ACCESS_TOKEN } }
        );

        if (response.data && response.data[0] && response.data[0].ErrorMessage) {
            console.error('PHP API Error:', response.data[0].ErrorMessage);
            return res.status(500).json({ error: 'Failed to save attachment details', details: response.data });
        }

        res.status(200).json(response.data);
    } catch (error) {
        console.error('PHP API Error:', error.response ? error.response.data : error.message);
        res.status(500).json({ 
            error: 'Failed to upload data to PHP backend', 
            details: error.response ? error.response.data : error.message 
        });
    }
});

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
