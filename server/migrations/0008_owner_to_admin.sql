-- Owner is no longer a role: Admin is the single built-in role with every permission.
-- Everyone who was an Owner becomes an Admin.
UPDATE `users` SET `role` = 'Admin' WHERE `role` = 'Owner';
