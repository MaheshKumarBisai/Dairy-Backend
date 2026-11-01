# 🥛 Dairy Backend (`Dairy-Backend`)

Core backend API service for the Dairy Marketplace & Subscription platform built with **NestJS**, **Prisma ORM**, **PostgreSQL**, and **Redis**.

- **GitHub Repository:** [https://github.com/MaheshKumarBisai/Dairy-Backend.git](https://github.com/MaheshKumarBisai/Dairy-Backend.git)
- **Default Port:** `4000`
- **Health Check Endpoint:** `http://<ALB_DNS>/api/v1/health`

---

## 🏗️ System Architecture & AWS Infrastructure

![System Architecture](docs/architecture.png)

### High-Level Flow
1. **Application Load Balancer (ALB)** receives all incoming HTTP/HTTPS traffic on public subnets and performs path-based routing:
   - `/api/v1/*` ➔ **Main Backend** (EC2 Instance 1, Port `4000`)
   - `/api/admin/*` ➔ **Admin Backend** (EC2 Instance 2, Port `4001`)
   - Default (all other traffic) ➔ **Admin Frontend** (EC2 Instance 2, Port `3001` mapped to container port 80)
2. **EC2 Instances** run in **private subnets** with **zero public IPs** and are managed completely through **AWS Systems Manager (SSM)**. No SSH keys or open port 22.
3. **Amazon RDS PostgreSQL** runs in private subnets, accessible only from the application security group.
4. **Amazon S3** stores product and profile assets under `uploads/`.
5. **AWS Lambda (`dairy-s3`)** triggers on `uploads/` creation, validates images, generates thumbnails, and saves them under `processed/thumbnails/`.

---

## 🗺️ Step-by-Step AWS Infrastructure Setup Plan

Follow this exact blueprint to provision the entire cloud infrastructure from scratch:

### 1. VPC & Networking
1. Open **VPC Console** ➔ **Create VPC**:
   - Name: `dairy-vpc`
   - IPv4 CIDR block: `10.0.0.0/16`
   - Tenancy: Default
   - Enable **DNS hostnames** and **DNS resolution**.
2. **Create Subnets**:
   - **Public Subnet 1:** `10.0.1.0/24` (AZ: `us-east-2a`, enable auto-assign public IPv4)
   - **Public Subnet 2:** `10.0.2.0/24` (AZ: `us-east-2b`, enable auto-assign public IPv4)
   - **Private Subnet 1 (Compute/RDS):** `10.0.138.0/24` (AZ: `us-east-2a`)
   - **Private Subnet 2 (Compute/RDS):** `10.0.148.0/24` (AZ: `us-east-2b`)
3. **Internet Gateway (IGW)**:
   - Create `dairy-igw` and attach it to `dairy-vpc`.
4. **NAT Gateway** (or VPC Endpoints):
   - Allocate an Elastic IP and create `dairy-nat-gw` in `Public Subnet 1`.
5. **Route Tables**:
   - **Public Route Table:** Route `0.0.0.0/0` ➔ `dairy-igw`. Associate with `Public Subnet 1` and `Public Subnet 2`.
   - **Private Route Table:** Route `0.0.0.0/0` ➔ `dairy-nat-gw`. Associate with `Private Subnet 1` and `Private Subnet 2`.

---

### 2. Security Groups
Create 3 dedicated security groups in `dairy-vpc`:

1. **`sg-dairy-alb` (Load Balancer)**:
   - **Inbound:** HTTP (Port `80`) from `0.0.0.0/0` and HTTPS (Port `443`) from `0.0.0.0/0`.
   - **Outbound:** All traffic (`0.0.0.0/0`).
2. **`sg-dairy-ec2` (Application Instances)**:
   - **Inbound:**
     - Port `4000` (Main Backend) from source `sg-dairy-alb`.
     - Port `4001` (Admin Backend) from source `sg-dairy-alb`.
     - Port `3001` (Admin Frontend) from source `sg-dairy-alb`.
   - **Outbound:** All traffic (`0.0.0.0/0`).
3. **`sg-dairy-rds` (Database)**:
   - **Inbound:** PostgreSQL (Port `5432`) from source `sg-dairy-ec2` and Lambda.
   - **Outbound:** All traffic.

---

### 3. Amazon RDS PostgreSQL
1. Open **RDS Console** ➔ **Subnet groups** ➔ **Create DB subnet group**:
   - Name: `dairy-rds-subnet-group`
   - VPC: `dairy-vpc`
   - Select `Private Subnet 1` and `Private Subnet 2`.
2. **Create Database**:
   - Engine: **PostgreSQL** (version 15 or 16).
   - Template: Free tier or Production (e.g. `db.t4g.micro` or `db.t3.medium`).
   - DB instance identifier: `dairy-backend`
   - Master username: `postgres`
   - Master password: `YourSecurePassword123!`
   - Virtual Private Cloud (VPC): `dairy-vpc`
   - DB Subnet Group: `dairy-rds-subnet-group`
   - Public access: **No**
   - Existing VPC security groups: `sg-dairy-rds`
   - Initial database name: `postgres`

---

### 4. Amazon S3 Bucket & Public Policy
1. Open **S3 Console** ➔ **Create bucket**:
   - Bucket name: e.g. `prod-dairy-images-09876`
   - Region: `us-east-2`
2. **Permissions ➔ Block Public Access**:
   - Click **Edit** ➔ **Uncheck** *“Block all public access”* ➔ **Save changes**.
3. **Permissions ➔ Bucket policy**:
   - Add the following policy to allow public browser viewing of product images:
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "PublicReadGetObject",
      "Effect": "Allow",
      "Principal": "*",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::prod-dairy-images-09876/*"
    }
  ]
}
```
4. **Permissions ➔ Cross-origin resource sharing (CORS)**:
```json
[
  {
    "AllowedHeaders": ["*"],
    "AllowedMethods": ["GET", "HEAD"],
    "AllowedOrigins": ["*"],
    "ExposeHeaders": []
  }
]
```

---

### 5. IAM Roles
Create two IAM roles in AWS IAM:

1. **`EC2-SSM-Role`** (Assumed by EC2 instances):
   - Attach policies:
     - `AmazonSSMManagedInstanceCore` (allows management via AWS SSM Run Command)
     - `AmazonS3FullAccess` (allows reading and uploading images to S3)
     - `AmazonEC2ContainerRegistryReadOnly` (allows pulling Docker images from ECR)
2. **`Lambda-S3-Role`** (Assumed by Lambda function):
   - Attach policies:
     - `AWSLambdaBasicExecutionRole` (writes logs to CloudWatch)
     - `AmazonS3FullAccess` (reads raw image and writes thumbnail back to S3)

---

### 6. EC2 Instances (Private Subnets)
Launch two Ubuntu instances inside the private subnets:

- **Instance 1 (`Dairy-Backend`):**
  - Subnet: `Private Subnet 1` (`10.0.138.0/24`)
  - Auto-assign Public IP: **Disable**
  - IAM instance profile: `EC2-SSM-Role`
  - Security group: `sg-dairy-ec2`
  - Root volume: `16 GB` GP3
- **Instance 2 (`Dairy-Adm-Portal`):**
  - Subnet: `Private Subnet 2` (`10.0.148.0/24`)
  - Auto-assign Public IP: **Disable**
  - IAM instance profile: `EC2-SSM-Role`
  - Security group: `sg-dairy-ec2`
  - Root volume: `16 GB` GP3

#### Docker Installation on EC2 (Run via SSM):
```bash
sudo apt update && sudo apt install -y docker.io jq
sudo systemctl enable --now docker
sudo usermod -aG docker ubuntu
```

---

### 7. Application Load Balancer (ALB) & Path Routing
1. Open **EC2 Console** ➔ **Load Balancers** ➔ **Create Application Load Balancer**:
   - Name: `dairy-alb`
   - Scheme: **Internet-facing**
   - VPC: `dairy-vpc`
   - Mappings: Select `Public Subnet 1` and `Public Subnet 2`.
   - Security Group: `sg-dairy-alb`
2. **Create Target Groups**:
   - **`tg-dairy-backend`**: Target type `Instance`, Protocol `HTTP`, Port `4000`, Health check path `/api/v1/health`. Register Instance 1.
   - **`tg-admin-backend`**: Target type `Instance`, Protocol `HTTP`, Port `4001`, Health check path `/api/admin/health`. Register Instance 2.
   - **`tg-admin-frontend`**: Target type `Instance`, Protocol `HTTP`, Port `3001`, Health check path `/`. Register Instance 2.
3. **Configure Listener Rules (Port 80)**:
   - **Rule 1 (IF Path is `/api/v1/*`):** Forward to `tg-dairy-backend`.
   - **Rule 2 (IF Path is `/api/admin/*`):** Forward to `tg-admin-backend`.
   - **Default Rule:** Forward to `tg-admin-frontend`.

---

### 8. AWS Lambda Serverless Thumbnail Processor
1. Open **Lambda Console** ➔ **Create Function**:
   - Function name: `dairy-s3`
   - Runtime: **Node.js 20.x** or **Node.js 24.x**
   - Architecture: `x86_64`
   - Execution role: Use existing role `Lambda-S3-Role`.
2. **Configuration Settings**:
   - **General Configuration**: Timeout = **`30 sec`**, Memory = **`512 MB`**.
   - **Runtime settings**: Handler = `index.handler`.
3. **Add S3 Trigger**:
   - Bucket: `movie-app-images-123`
   - Event type: `All object create events` (`s3:ObjectCreated:*`)
   - Prefix: `uploads/`
4. **Deploy Code**:
   - Upload the pre-built `aws-lambda-image-processor/function.zip` via **Upload from ➔ .zip file**.

---

## 🔐 GitHub Secrets Configuration

Add these secrets under **Settings ➔ Secrets and variables ➔ Actions** in your GitHub repositories.

### Secrets Table & Example Values

| Secret Name | Example / Expected Value | Description | Required By |
| --- | --- | --- | --- |
| `AWS_ACCESS_KEY_ID` | `AKIAIOSFODNN7EXAMPLE` | IAM User access key with ECR and SSM permissions | All 3 Repos |
| `AWS_SECRET_ACCESS_KEY` | `wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY` | IAM User secret key | All 3 Repos |
| `AWS_REGION` | `us-east-2` | AWS deployment region | All 3 Repos |
| `DATABASE_URL` | `postgresql://postgres:YourPass123!@dairy-backend.cfoqq6cwepty.us-east-2.rds.amazonaws.com:5432/postgres?schema=public` | PostgreSQL connection string | Main & Admin Backend |
| `REDIS_HOST` | `localhost` | Redis host (or ElastiCache endpoint) | Main Backend |
| `REDIS_PORT` | `6379` | Redis port | Main Backend |
| `JWT_SECRET` | `super-secret-dairy-jwt-access-key-production` | Secret for verifying JWT auth tokens | Main & Admin Backend |
| `AWS_S3_BUCKET_NAME` | `prod-dairy-images-09876` | Target S3 bucket for product images | Main & Admin Backend |
| `ECR_REPOSITORY_MAIN_BACKEND` | `dairy-backend` | Amazon ECR repo name for Main Backend | Main Backend |
| `EC2_INSTANCE_ID_MAIN_BACKEND` | `i-06484e1d6837123aa` | Private EC2 Instance ID for Main Backend | Main Backend |
| `ECR_REPOSITORY_ADMIN_BACKEND` | `dairy-admin-backend` | Amazon ECR repo name for Admin Backend | Admin Backend |
| `EC2_INSTANCE_ID_ADMIN_PORTAL` | `i-055a7654c466a211f` | Private EC2 Instance ID for Admin Portal | Admin Backend & Frontend |
| `ECR_REPOSITORY_ADMIN_FRONTEND` | `dairy-admin-frontend` | Amazon ECR repo name for Admin Frontend | Admin Frontend |

> **Note on EC2 Instance IDs:** Do not wrap instance IDs with quotes, brackets, or arrays (use `i-055a7654c466a211f`, not `["i-055a..."]`).

---

## ✅ Successful Commands Reference

Use these tested, verified commands that succeeded during setup:

### 1. Database Schema Push & Data Seeding
```bash
# Push schema directly to RDS PostgreSQL
npx prisma db push

# Seed categories, demo products, and accounts
npm run prisma:seed
```

### 2. Packaging the Lambda Function
```bash
cd aws-lambda-image-processor

# Install production dependencies
npm install --omit=dev

# Package into deployment zip
zip -r function.zip index.mjs package.json node_modules/
```

### 3. Verifying S3 Uploads & Thumbnails (from EC2 terminal)
```bash
# Check raw uploads created by the backend
aws s3 ls s3://prod-dairy-images-09876/uploads/products/MR-100001/

# Check thumbnails generated by Lambda
aws s3 ls s3://prod-dairy-images-09876/processed/thumbnails/products/MR-100001/
```

### 4. Inspecting Running Docker Containers on EC2
```bash
# Check container status
docker ps

# Check container logs
docker logs -f dairy-backend
docker logs -f dairy-admin-backend
docker logs -f dairy-admin-frontend

# Inspect environment variables injected into container
docker inspect dairy-backend | grep -i DATABASE_URL
```

### 5. Testing ALB Health Checks
```bash
# Main Backend Health
curl -I http://dairy-lb-2052637137.us-east-2.elb.amazonaws.com/api/v1/health

# Admin Backend Health
curl -I http://dairy-lb-2052637137.us-east-2.elb.amazonaws.com/api/admin/health

# Admin Portal Web Page
curl -I http://dairy-lb-2052637137.us-east-2.elb.amazonaws.com/
```

---

## ⚠️ Potential Errors & Exact Troubleshooting Solutions

| Error | Root Cause | Exact Solution |
| --- | --- | --- |
| **`AccessDenied: User ... is not authorized to perform: s3:PutObject`** | The EC2 instance IAM role lacks S3 write permissions. | Open **IAM Console** ➔ find `EC2-SSM-Role` ➔ attach policy **`AmazonS3FullAccess`**. |
| **`AccessDenied: ... not authorized to perform: s3:ListBucket`** | The IAM role cannot list bucket objects. | Attach **`AmazonS3FullAccess`** to the role. |
| **Product image previews broken / 403 Forbidden in browser** | S3 bucket blocks public access or is missing `s3:GetObject` policy. | In S3 bucket **Permissions**: Uncheck **Block all public access**, and paste the public read Bucket Policy allowing `s3:GetObject`. |
| **`P1001: Can't reach database server at ...:5432`** | RDS was created in a separate VPC or its Security Group blocks port 5432. | Ensure RDS is in `dairy-vpc`. Edit `sg-dairy-rds` inbound rules to allow port `5432` from `sg-dairy-ec2`. |
| **`TypeError: Cannot read properties of undefined (reading 'output')` in Lambda** | `sharp` native C++ binary (`libvips-cpp.so`) failed to link on Node.js 24 runtime. | Replace `sharp` with **`jimp`** (pure JavaScript). Upload `aws-lambda-image-processor/function.zip`. |
| **`Lambda Task timed out after 3.00 seconds`** | Default Lambda timeout (3 sec) is too short for downloading and processing images. | In Lambda **Configuration ➔ General configuration**, increase **Timeout** to **`30 sec`** and **Memory** to **`512 MB`**. |
| **`Value '[i-...]' at 'instanceIds' failed to satisfy constraint` in GitHub Actions** | The GitHub Secret `EC2_INSTANCE_ID_*` contains brackets, quotes, or whitespace. | Update the secret in GitHub to be a raw single ID like `i-055a7654c466a211f`. |
| **`export: get-login-password: bad variable name` in SSM Run Command** | Line breaks were mangled when passing multi-line bash scripts through AWS SSM JSON parameters. | Base64-encode the deployment script (`base64 -w 0 < script.sh`) and execute with `echo "$B64" \| base64 -d \| bash`. |
| **`EACCES: permission denied, mkdir '/app/uploads'` inside Docker container** | The container process runs as a non-root user without permissions to write to `/app/uploads`. | In `Dockerfile`, add `RUN mkdir -p /app/uploads && chown -R expressjs:nodejs /app/uploads`. |
| **`PrismaClientInitializationError: Unable to require('libquery_engine-linux-musl.so.node')`** | Alpine Linux (`node:alpine`) lacks required OpenSSL dynamic libraries for Prisma query engine. | Switch Dockerfile base image to **`node:20-bookworm-slim`** (Debian glibc) with `openssl` installed. |

---

## 📱 Mobile Applications & Preview APK Build Guide

The platform includes two cross-platform mobile apps built with **Expo (React Native)** and **Expo Router**:
- **Customer Mobile App:** `front-end-dairy/customer` (Port `5173`)
- **Delivery Partner Mobile App:** `front-end-dairy/delivery` (Port `5174`)

---

### 1. Running the Mobile Apps Locally / Web Preview

Both mobile apps are configured to connect to your live AWS cloud backend via your Application Load Balancer:
```env
EXPO_PUBLIC_API_URL=http://dairy-lb-2052637137.us-east-2.elb.amazonaws.com/api/v1
```

#### Run Customer App:
```bash
cd front-end-dairy/customer
npm install
npx expo start -c
```
- Press `w` to view immediately in your web browser.
- Or scan the terminal QR code using the **Expo Go** mobile app on your Android or iPhone.

#### Run Delivery Partner App:
```bash
cd front-end-dairy/delivery
npm install
npx expo start -c
```
- Press `w` to view immediately in your web browser.
- Or scan the terminal QR code using **Expo Go**.

---

### 2. How to Build Standalone Preview APKs (`.apk` for Android)

Both mobile apps include pre-configured `eas.json` build profiles set to output direct, installable Android APKs (`buildType: "apk"`).

#### Option A: Cloud Build via EAS CLI (Recommended — No Android Studio or heavy tools needed)

1. **Install EAS CLI globally:**
   ```bash
   npm install -g eas-cli
   ```

2. **Log into your Expo account:**
   ```bash
   eas login
   ```
   *(Sign up for a free account at [expo.dev](https://expo.dev) if you don't have one).*

3. **Build Customer App APK:**
   ```bash
   cd front-end-dairy/customer
   eas build --platform android --profile preview
   ```
   - When prompted to generate a new Android Keystore, select **Yes (Let EAS generate it)**.
   - EAS will compile the app in the cloud and output a direct download link (and QR code) for `dairy-customer-preview.apk`.

4. **Build Delivery Partner App APK:**
   ```bash
   cd front-end-dairy/delivery
   eas build --platform android --profile preview
   ```
   - Once completed, download and install the APK on any Android phone to test live real-time order notifications and map tracking!

---

#### Option B: Local Android APK Build (Requires Android Studio & JDK 17 installed)

If you have Android Studio and the Android SDK installed locally on your computer:

1. **Generate the native Android build files:**
   ```bash
   cd front-end-dairy/customer
   npx expo prebuild --platform android
   ```

2. **Compile the standalone APK using Gradle:**
   ```bash
   cd android
   ./gradlew assembleRelease
   ```

3. **Locate your output APK:**
   ```text
   front-end-dairy/customer/android/app/build/outputs/apk/release/app-release.apk
   ```
   Copy this `.apk` to your phone or emulator to install directly!

