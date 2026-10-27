# 🥛 Dairy Backend (`Dairy-Backend`)

Core enterprise backend service for the Dairy Marketplace and Subscription platform, powered by **NestJS**, **Prisma ORM**, **PostgreSQL**, **Redis**, and **Socket.io**.

- **GitHub Repository:** [https://github.com/MaheshKumarBisai/Dairy-Backend.git](https://github.com/MaheshKumarBisai/Dairy-Backend.git)
- **Port:** `4000`

---

## 🌐 Platform Architecture & Connected Repositories

This repository contains the **Main Core Backend** of the platform. The other modules in the Dairy platform are maintained in their respective standalone repositories:

| Service / App | Repository | Port | Description |
| --- | --- | --- | --- |
| **Main Backend** (This Repo) | [Dairy-Backend](https://github.com/MaheshKumarBisai/Dairy-Backend.git) | `4000` | NestJS Core API, Auth, Orders, Subscriptions, Payments, Geo |
| **Admin Backend** | [Dairy-Adm-Backend](https://github.com/MaheshKumarBisai/Dairy-Adm-Backend.git) | `4001` | Express.js Admin API with live SSE event streaming |
| **Admin Frontend** | [Dairy-Adm-frontend](https://github.com/MaheshKumarBisai/Dairy-Adm-frontend.git) | `3001` | React + Vite administrative dashboard |
| **Customer App** | [Dairy-customer-frontend](https://github.com/MaheshKumarBisai/Dairy-customer-frontend.git) | `5173` | Expo customer mobile web app with live order tracking |
| **Delivery App** | [Dairy-delivery-frontend](https://github.com/MaheshKumarBisai/Dairy-delivery-frontend.git) | `5174` | Expo delivery courier app with GPS turn navigation |

> **Note:** The `admin/` and `front-end-dairy/` folders are excluded from this repository via `.gitignore` to maintain clean separation across independent git repositories.

---

## 📋 Prerequisites
- **Node.js:** `v20.x` or higher (`node -v`)
- **npm:** `v10.x` or higher (`npm -v`)
- **Docker Desktop:** Running (`docker --version` and `docker compose version`)

---

## ⚡ Local Setup

### 1. Clone & Navigate
```bash
git clone https://github.com/MaheshKumarBisai/Dairy-Backend.git
cd Dairy-Backend
```

### 2. Start PostgreSQL & Redis Containers
Start the required PostgreSQL and Redis services using Docker Compose:
```bash
docker compose up -d
```
> **Services started:**
> - **PostgreSQL:** `localhost:5433` (DB: `dairy_db`, User: `dairy_user`, Password: `dairy_password`)
> - **Redis:** `localhost:6379`

### 3. Configure Environment Variables
Create your local `.env` file from `.env.example`:
```bash
cp .env.example .env
```

### 4. Install Dependencies
```bash
npm install
```

### 5. Setup Database Schema & Seed Data
Push the Prisma database schema and populate initial demo products, merchants, users, and addresses:
```bash
npx prisma db push
npm run prisma:seed
```

### 6. Start Development Server
```bash
npm run start:dev
```

The Main Backend is now active at **http://localhost:4000** (API base: `http://localhost:4000/api/v1`).

---

## 🔑 Demo Seed Credentials
All seed accounts use the default password: **`Password@123`**

| Role | Email | Name / ID |
| --- | --- | --- |
| **Customer** | `customer@example.com` | Ananya Roy |
| **Delivery Partner** | `driver.raj@farmfresh.com` | DEL-100001 (Rajesh Kumar) |
| **Merchant** | `merchant@farmfresh.com` | MR-100001 (FarmFresh Dairy) |
| **Merchant** | `merchant@greenvalley.com` | MR-100002 (GreenValley Organics) |
| **Admin** | `admin@dairyplatform.com` | System Admin |

---

## 📡 Key Core API Endpoints
- **Swagger / API Docs:** `GET http://localhost:4000/api/docs`
- **Health:** `GET http://localhost:4000/api/v1/health`
- **Authentication:** `POST http://localhost:4000/api/v1/auth/login`
- **Products:** `GET http://localhost:4000/api/v1/products`
- **Cart:** `GET / POST http://localhost:4000/api/v1/cart`
- **Orders:** `GET / POST http://localhost:4000/api/v1/orders`
- **Subscription Plans:** `GET / POST http://localhost:4000/api/v1/dairy-plans`
- **Deliveries:** `GET / PATCH http://localhost:4000/api/v1/deliveries`
