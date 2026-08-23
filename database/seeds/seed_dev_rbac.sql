-- seed_dev_rbac.sql

-- Insert Roles
INSERT OR IGNORE INTO roles (id, name, description, created_at) VALUES 
('role-super-admin', 'SUPER_ADMIN', 'Full system access', strftime('%s', 'now')),
('role-operations', 'OPERATIONS_ADMIN', 'Operations management', strftime('%s', 'now')),
('role-content', 'CONTENT_MANAGER', 'Content management', strftime('%s', 'now')),
('role-finance', 'FINANCE_ADMIN', 'Finance management', strftime('%s', 'now')),
('role-readonly', 'READ_ONLY_ADMIN', 'Read only access', strftime('%s', 'now'));

-- Insert Permissions
INSERT OR IGNORE INTO permissions (id, action, description) VALUES
('perm-dash-view', 'dashboard.view', 'View dashboard'),
('perm-users-view', 'users.view', 'View users'),
('perm-users-edit', 'users.edit', 'Edit users'),
('perm-orders-view', 'orders.view', 'View orders'),
('perm-orders-edit', 'orders.edit', 'Edit orders'),
('perm-orders-assign', 'orders.assign', 'Assign orders to vendors'),
('perm-cat-view', 'catalog.view', 'View catalog'),
('perm-cat-edit', 'catalog.edit', 'Edit catalog'),
('perm-cont-view', 'content.view', 'View content'),
('perm-cont-edit', 'content.edit', 'Edit content'),
('perm-pay-view', 'payments.view', 'View payments'),
('perm-vend-view', 'vendors.view', 'View vendors'),
('perm-vend-edit', 'vendors.edit', 'Edit vendors'),
('perm-anal-view', 'analytics.view', 'View analytics'),
('perm-exp-users', 'exports.users', 'Export users'),
('perm-exp-orders', 'exports.orders', 'Export orders'),
('perm-audit-view', 'audit.view', 'View audit logs'),
('perm-set-view', 'settings.view', 'View settings'),
('perm-set-edit', 'settings.edit', 'Edit settings');

-- Map all permissions to SUPER_ADMIN
INSERT OR IGNORE INTO role_permissions (role_id, permission_id)
SELECT 'role-super-admin', id FROM permissions;

-- Note: A real admin_users record with a valid Supabase UUID needs to be linked manually for development.
