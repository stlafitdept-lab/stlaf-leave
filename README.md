# STLAF - Leave and Overtime Management System

A comprehensive Single-Page Application (SPA) web portal designed to streamline internal human resource operations. The platform automates tracking, submitting, auditing, and approving employee data including Leaves, Overtime, Undertime/Halfday, and Official Business (OB) / Field Work logs.

**Live Frontend Platform Deployment:** [https://stlaf-leave.vercel.app/](https://stlaf-leave.vercel.app/)

---

## 🚀 Technical Architecture & System Infrastructure

The system uses a completely **decoupled architecture** separating client layouts from structured data endpoints:

### 1. Frontend Client Workspace
* **Local Project Path:** `C:\Users\o876\stlaf-leave`
* **Hosting Target:** Deployed onto global edge-routing meshes via **Vercel**.
* **Tech Stack Ecosystem:** React 19, Vite 8, Tailwind CSS, Firebase Client SDK, Vercel Speed Insights, and Excel parsing utility nodes (`xlsx`). Contains localized PHP scripts for administration data extraction.

### 2. Backend Relational Data API
* **Local Server Path:** `C:\xampp\htdocs\stlaf-api`
* **Runtime Host Engine:** Apache Server (via XAMPP toolsets mapping local loops or proxy pipelines to MySQL engines).
* **Tech Stack Ecosystem:** Procedural/Core PHP API layers coupled with PDO database connections, CORS configurations, and container options via Docker.

---

## 📂 System Manifest & File Map

### Frontend Layout Workspace (`C:\Users\o876\stlaf-leave`)
* `index.html` – The single-page DOM mounting landing grid holding responsive entry views and Tailwinds compilation layouts.
* `eslint.config.js` – Imposes clean, unified parsing rules across development cycles.
* `vercel.json` – Handles catch-all rewrite rules so client reloads map cleanly back to the SPA core without producing 404 network errors.
* `package.json` – Holds third-party node dependency hashes (React 19, Vite 8, Firebase).
* **Data Processing & Export Utility Files:**
  * `export_data.php` – Connects to remote/local databases to extract category matrices (Leave, Overtime, OB) filtered across specific date parameters.
  * `export_members.php` – Iterates through internal active user registries to export structured CSV rosters with Excel-friendly UTF-8 BOM rendering.
  * `export_requests.php` – Safely filters and outputs a trailing 3-month submission historical audit log.

### Backend Server Endpoints (`C:\xampp\htdocs\stlaf-api`)
As shown in the system configuration layout (`image_22f908.png`), the API handles data transactions via dedicated sub-modules:
* **Configuration & Security:**
  * `cors.php` – Handles Cross-Origin Resource Sharing rules allowing safe client requests from Vercel/localhost.
  * `db_config.php` – Manages environment parameters and active links to the central MySQL instance.
  * `dockerfile` – Container specification file for reproducible virtual deployment environments.
* **Core Operations & Authentication:**
  * `index.php` – Root API landing script.
  * `login.php` – Verifies employee user credentials and generates access context configurations.
* **Data Retrieval (GET Endpoints):**
  * `get_admin_data.php` & `get_stats.php` – Deliver high-level metrics, summary tallies, and administrative data.
  * `get_approvals.php` – Pulls current pending submission logs for decision managers.
  * `get_leaves.php`, `get_ob.php`, `get_overtime.php`, `get_stats.php`, `get_undertime.php` – Collect individual structural transaction logs based on categories.
* **Data Processing & Storage (SAVE/UPDATE/DELETE Endpoints):**
  * `save_employee.php` & `update_employee.php` – Oversee active worker system registry creation and modifications.
  * `save_leave.php`, `save_ob.php`, `save_ot.php` – Capture and persist new transactional filing requests.
  * `update_leave.php`, `update_ot.php`, `update_status.php` – Push state adjustments (Approved, Disapproved, Cancelled) down database tracks.
  * `delete_leave.php`, `delete_ot.php`, `delete_user.php` – Safely purge data records or user profiles from relational tables.

---

## 🛠️ Step-by-Step Local Setup & Development Guide

Follow these exact steps to set up the project locally on your machine, starting completely from downloaded `.zip` asset packages.

### Step 1: Extracting the ZIP Files to Your Local Directories
1. Locate your downloaded ZIP packages (e.g., `stlaf-leave.zip` and `stlaf-api.zip`).
2. Extract the frontend client package to your user environment track:
   * **Target Path:** `C:\Users\o876\stlaf-leave`
3. Extract the backend API package into your local XAMPP web service route:
   * **Target Path:** `C:\xampp\htdocs\stlaf-api`
4. Open the backend directory and ensure that your core configuration files listed in `image_22f908.png` are sitting directly inside the root of `C:\xampp\htdocs\stlaf-api\`.

---

### Step 2: Environment Variables Setup (Frontend)
1. Open your code editor (e.g., VS Code) and target the workspace directory: `C:\Users\o876\stlaf-leave`.
2. Look for a file named `.env.local` in the root folder structure. If it does not exist, create a new empty text file and name it exactly `.env.local`.
3. Add the background gateway environmental line pointing to your local machine loop:
```env
   VITE_API_BASE_URL=http://localhost/stlaf-api