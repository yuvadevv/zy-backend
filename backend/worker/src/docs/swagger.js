/**
 * OpenAPI 3.0 Specification & Swagger UI Handler
 */

export const openApiSpec = {
  openapi: "3.0.3",
  info: {
    title: "Blintzy Enterprise API",
    version: "2.0.0",
    description: "Production API for Blintzy Campus Print Platform. Serves Student, Admin, and Vendor Portals."
  },
  servers: [
    {
      url: "http://127.0.0.1:8787",
      description: "Local Development Worker"
    }
  ],
  components: {
    securitySchemes: {
      BearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
        description: "Enter your JWT token (obtained from /api/auth/login). Example: Bearer eyJhbGciOi..."
      }
    },
    schemas: {
      ErrorResponse: {
        type: "object",
        properties: {
          success: { type: "boolean", example: false },
          error: {
            type: "object",
            properties: {
              code: { type: "string", example: "BAD_REQUEST" },
              message: { type: "string", example: "Invalid input provided" }
            }
          }
        }
      },
      LoginRequest: {
        type: "object",
        required: ["password"],
        properties: {
          email: { type: "string", format: "email", example: "admin@blintzy.local" },
          username: { type: "string", example: "admin" },
          password: { type: "string", example: "admin123" }
        }
      },
      SignupRequest: {
        type: "object",
        required: ["email", "password"],
        properties: {
          email: { type: "string", format: "email", example: "student@college.edu" },
          password: { type: "string", example: "Secret123!" },
          data: {
            type: "object",
            properties: {
              fullName: { type: "string", example: "Rohan Kumar" },
              phone: { type: "string", example: "9876543210" }
            }
          }
        }
      }
    }
  },
  security: [
    {
      BearerAuth: []
    }
  ],
  paths: {
    "/api/health": {
      get: {
        summary: "System Health Check",
        tags: ["System"],
        security: [],
        responses: {
          "200": { description: "Service is healthy" }
        }
      }
    },
    "/api/platform/status": {
      get: {
        summary: "Platform & Maintenance Status",
        tags: ["System"],
        security: [],
        responses: {
          "200": { description: "Platform status" }
        }
      }
    },
    "/api/auth/login": {
      post: {
        summary: "User / Admin / Vendor Login",
        description: "Authenticate using email or username with password. Returns session JWT access_token and user profile.",
        tags: ["Authentication"],
        security: [],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/LoginRequest" }
            }
          }
        },
        responses: {
          "200": { description: "Authentication successful with token" },
          "401": { description: "Invalid credentials", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } }
        }
      }
    },
    "/api/auth/signup": {
      post: {
        summary: "User Signup",
        description: "Register a new student account.",
        tags: ["Authentication"],
        security: [],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/SignupRequest" }
            }
          }
        },
        responses: {
          "200": { description: "Signup successful" },
          "400": { description: "Validation error" }
        }
      }
    },
    "/api/auth/logout": {
      post: {
        summary: "User Logout",
        tags: ["Authentication"],
        responses: {
          "200": { description: "Logged out successfully" }
        }
      }
    },
    "/api/auth/oauth/google": {
      get: {
        summary: "Google OAuth Login Redirect",
        description: "Redirects user to Google OAuth via Supabase Auth. Takes redirect_to and next parameters.",
        tags: ["Authentication"],
        security: [],
        parameters: [
          { name: "redirect_to", in: "query", schema: { type: "string" }, description: "Callback URL in frontend" },
          { name: "next", in: "query", schema: { type: "string" }, description: "Destination route after login" }
        ],
        responses: {
          "302": { description: "Redirect to OAuth identity provider" }
        }
      }
    },
    "/api/auth/oauth/exchange": {
      post: {
        summary: "Exchange OAuth Authorization Code",
        description: "Exchanges authorization code received from OAuth callback for JWT session tokens.",
        tags: ["Authentication"],
        security: [],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  code: { type: "string" }
                },
                required: ["code"]
              }
            }
          }
        },
        responses: {
          "200": { description: "Session tokens returned successfully" },
          "400": { description: "Invalid authorization code" }
        }
      }
    },
    "/api/auth/me": {
      get: {
        summary: "Get Authenticated User Profile",
        tags: ["Authentication"],
        security: [{ BearerAuth: [] }],
        responses: {
          "200": { description: "Current user profile" },
          "401": { description: "Unauthorized" }
        }
      }
    },
    "/api/students/me": {
      get: {
        summary: "Get Current Student Profile & Academic Details",
        tags: ["Student"],
        security: [{ BearerAuth: [] }],
        responses: {
          "200": { description: "Student profile with college and branch details" }
        }
      },
      put: {
        summary: "Update Current Student Profile (Onboarding)",
        tags: ["Student"],
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  name: { type: "string" },
                  roll_number: { type: "string" },
                  phone: { type: "string" },
                  college_id: { type: "string" },
                  branch_id: { type: "string" },
                  study_year_id: { type: "string" },
                  semester_id: { type: "string" }
                }
              }
            }
          }
        },
        responses: {
          "200": { description: "Student profile updated" }
        }
      }
    },
    "/api/manuals": {
      get: {
        summary: "List Academic Manuals",
        tags: ["Manuals"],
        security: [],
        parameters: [
          { name: "college_id", in: "query", schema: { type: "string" } },
          { name: "branch_id", in: "query", schema: { type: "string" } },
          { name: "study_year_id", in: "query", schema: { type: "string" } },
          { name: "semester_id", in: "query", schema: { type: "string" } }
        ],
        responses: {
          "200": { description: "List of available manuals" }
        }
      }
    },
    "/api/manuals/filters": {
      get: {
        summary: "Get Manual Filter Metadata",
        tags: ["Manuals"],
        security: [],
        responses: {
          "200": { description: "Branches, years, and semesters" }
        }
      }
    },
    "/api/manuals/{id}": {
      get: {
        summary: "Get Manual By ID",
        tags: ["Manuals"],
        security: [],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          "200": { description: "Manual details" }
        }
      }
    },
    "/api/orders": {
      get: {
        summary: "Get Student Orders",
        tags: ["Orders"],
        security: [{ BearerAuth: [] }],
        responses: {
          "200": { description: "List of student orders" }
        }
      },
      post: {
        summary: "Create New Order",
        tags: ["Orders"],
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  items: { type: "array", items: { type: "object" } },
                  deliveryDetails: { type: "object" }
                }
              }
            }
          }
        },
        responses: {
          "200": { description: "Order created successfully" }
        }
      }
    },
    "/api/orders/{id}": {
      get: {
        summary: "Get Order Details",
        tags: ["Orders"],
        security: [{ BearerAuth: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          "200": { description: "Detailed order information" }
        }
      }
    },
    "/api/pricing/calculate": {
      post: {
        summary: "Calculate Dynamic Print Pricing",
        tags: ["Pricing"],
        security: [{ BearerAuth: [] }],
        responses: {
          "200": { description: "Calculated subtotal, delivery fee, and total" }
        }
      }
    },
    "/api/documents": {
      post: {
        summary: "Upload Document (PDF)",
        tags: ["Documents"],
        security: [{ BearerAuth: [] }],
        responses: {
          "200": { description: "Document uploaded to R2" }
        }
      }
    },
    "/api/admin/dashboard": {
      get: {
        summary: "Admin Dashboard Metrics",
        tags: ["Admin"],
        security: [{ BearerAuth: [] }],
        responses: {
          "200": { description: "Overview stats (revenue, orders, active users)" }
        }
      }
    },
    "/api/admin/orders": {
      get: {
        summary: "Admin Orders List",
        tags: ["Admin"],
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: "status", in: "query", schema: { type: "string" } },
          { name: "page", in: "query", schema: { type: "integer" } },
          { name: "limit", in: "query", schema: { type: "integer" } },
          { name: "search", in: "query", schema: { type: "string" } }
        ],
        responses: {
          "200": { description: "Paginated orders list" }
        }
      }
    },
    "/api/admin/orders/{id}": {
      get: {
        summary: "Admin Get Order By ID",
        tags: ["Admin"],
        security: [{ BearerAuth: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          "200": { description: "Order details" }
        }
      }
    },
    "/api/admin/orders/{id}/status": {
      patch: {
        summary: "Update Order Status",
        tags: ["Admin"],
        security: [{ BearerAuth: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          "200": { description: "Status updated" }
        }
      }
    },
    "/api/admin/manuals": {
      get: {
        summary: "Admin List Manuals",
        tags: ["Admin"],
        security: [{ BearerAuth: [] }],
        responses: {
          "200": { description: "List of all manuals with stock" }
        }
      },
      post: {
        summary: "Create New Manual",
        tags: ["Admin"],
        security: [{ BearerAuth: [] }],
        responses: {
          "200": { description: "Manual created" }
        }
      }
    },
    "/api/admin/vendors": {
      get: {
        summary: "Admin List Vendors",
        tags: ["Admin"],
        security: [{ BearerAuth: [] }],
        responses: {
          "200": { description: "Vendors list" }
        }
      },
      post: {
        summary: "Create Vendor",
        tags: ["Admin"],
        security: [{ BearerAuth: [] }],
        responses: {
          "200": { description: "Vendor created" }
        }
      }
    },
    "/api/admin/users": {
      get: {
        summary: "Admin List Users",
        tags: ["Admin"],
        security: [{ BearerAuth: [] }],
        responses: {
          "200": { description: "Users list" }
        }
      }
    },
    "/api/vendor/dashboard": {
      get: {
        summary: "Vendor Dashboard Overview",
        tags: ["Vendor"],
        security: [{ BearerAuth: [] }],
        responses: {
          "200": { description: "Vendor stats (pending orders, printed today)" }
        }
      }
    },
    "/api/vendor/orders": {
      get: {
        summary: "Vendor Assigned Orders",
        tags: ["Vendor"],
        security: [{ BearerAuth: [] }],
        responses: {
          "200": { description: "List of vendor orders" }
        }
      }
    },
    "/api/vendor/orders/{id}/status": {
      patch: {
        summary: "Vendor Update Order Status",
        tags: ["Vendor"],
        security: [{ BearerAuth: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          "200": { description: "Status updated" }
        }
      }
    }
  }
};

/**
 * Returns the interactive Swagger UI HTML page
 */
export function handleSwaggerHtml(request) {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Blintzy API Documentation</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui.css" />
  <style>
    body {
      margin: 0;
      background: #fafafa;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    }
    .topbar {
      display: none !important;
    }
    .custom-header {
      background: #0f172a;
      color: #fff;
      padding: 16px 24px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    .custom-header h1 {
      margin: 0;
      font-size: 20px;
      font-weight: 600;
      letter-spacing: -0.5px;
    }
    .custom-header .badge {
      background: #3b82f6;
      color: #fff;
      padding: 4px 10px;
      border-radius: 9999px;
      font-size: 12px;
      font-weight: 600;
    }
  </style>
</head>
<body>
  <div class="custom-header">
    <h1>🚀 Blintzy Enterprise API</h1>
    <span class="badge">OpenAPI 3.0</span>
  </div>
  <div id="swagger-ui"></div>
  <script src="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
  <script>
    window.onload = () => {
      window.ui = SwaggerUIBundle({
        url: '/api/docs/openapi.json',
        dom_id: '#swagger-ui',
        deepLinking: true,
        persistAuthorization: true,
        displayRequestDuration: true,
        filter: true,
        docExpansion: 'list',
        defaultModelsExpandDepth: 1
      });
    };
  </script>
</body>
</html>`;

  return new Response(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8'
    }
  });
}

/**
 * Returns raw OpenAPI 3.0 specification in JSON format
 */
export function handleOpenApiJson() {
  return new Response(JSON.stringify(openApiSpec, null, 2), {
    headers: {
      'Content-Type': 'application/json'
    }
  });
}
