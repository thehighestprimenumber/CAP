import {GetObjectCommand, PutObjectCommand, S3Client} from "@aws-sdk/client-s3";
require('dotenv').config();
const s3Client = new S3Client({
    region: process.env.VITE_AWS_REGION,
    credentials: {
        accessKeyId: process.env.VITE_AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.VITE_AWS_SECRET_ACCESS_KEY,
    },
});
const bucketName = process.env.VITE_AWS_S3_BUCKET_ID;

const streamToString = async (stream) => {
    const reader = stream.getReader();
    const decoder = new TextDecoder("utf-8");
    let result = '';
    let done = false;

    while (!done) {
        const {value, done: doneReading} = await reader.read();
        done = doneReading;
        if (value) {
            result += decoder.decode(value, {stream: !done});
        }
    }

    return result;
};

function getFileName(cityName) {
    return `data/${toSnakeCase(cityName)}.json`;
}

export const readFile = async (cityName) => {
    try {
        const command = new GetObjectCommand({Bucket: bucketName, Key: getFileName(cityName),});
        const response = await s3Client.send(command);
        const data = await streamToString(response.Body);
        return JSON.parse(data);
    } catch (err) {
        console.error("Error reading file from S3:", err);
        throw err;
    }
};

export const writeFile = async (cityName, data) => {
    try {
        const dataJson = JSON.stringify(data, null, 2);
        const command = new PutObjectCommand({
            Bucket: bucketName,
            Key: getFileName(cityName),
            Body: dataJson,
            ContentType: "application/json",
        });
        await s3Client.send(command);
        console.log("New ranking saved to S3");
    } catch (err) {
        console.error("Error writing file to S3:", err);
        throw err;
    }
};

/* Function to convert city name to snake_case and replace non-English characters */
export const toSnakeCase = (str) => {
    return str
        .normalize('NFD') // Normalize the string
        .replace(/[\u0300-\u036f]/g, '') // Remove diacritics
        .toLowerCase()
        .replace(/[^a-z\s]/g, '') // Remove non-English characters
        .replace(/\s+/g, '_'); // Replace spaces with underscores
};