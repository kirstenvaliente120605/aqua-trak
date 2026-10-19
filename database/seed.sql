-- ============================================================================
-- AquaTracker Seed Data (sample rows for verification)
-- ============================================================================
USE `aquatracker`;

-- User base
INSERT IGNORE INTO `users` (`id`, `email`, `password_hash`, `role`, `full_name`, `phone`, `remember_me`) VALUES
  (UUID(), 'customer.demo@aquatracker.ph', '$2y$10$TwbLkHFxE/FV.aH/8j1.HO3cE2a0fZ8/mJ6u8WmTqW1k/I0xLl4q', 'customer', 'Mia Santos', '+63-917-555-4321', 1),
  (UUID(), 'owner.demo@aquatracker.ph', '$2y$10$TwbLkHFxE/FV.aH/8j1.HO3cE2a0fZ8/mJ6u8WmTqW1k/I0xLl4q', 'owner', 'Joan Dela Cruz', '+63-920-888-1234', 1),
  (UUID(), 'staff.demo@aquatracker.ph', '$2y$10$TwbLkHFxE/FV.aH/8j1.HO3cE2a0fZ8/mJ6u8WmTqW1k/I0xLl4q', 'staff', 'Dani Cruz', '+63-939-123-9876', 1);

-- Station owner profiles
INSERT IGNORE INTO `station_owners` (`id`, `user_id`, `business_name`) SELECT UUID(), id, 'ClearSpring Water Hub' FROM users WHERE email = 'owner.demo@aquatracker.ph';

-- Customer profile
INSERT IGNORE INTO `customers` (`id`, `user_id`, `default_address`, `aqua_points`) SELECT UUID(), id, 'Block 4, Lot 12, Sunrise Village, Brgy. San Jose', 240 FROM users WHERE email = 'customer.demo@aquatracker.ph';

-- Station
INSERT IGNORE INTO `stations` (`id`, `owner_id`, `name`, `address`, `lat`, `lng`, `operating_hours`, `status`) SELECT UUID(), so.id, 'DRINK n\' REFILL Purified Water Refilling Station', '45 Sabellano St, Pagadian City', 7.8269, 123.4371, '{"Mon":"7:30-16:30","Sat":"7:30-16:30"}', 'open' FROM station_owners so JOIN users u ON so.user_id = u.id WHERE u.email = 'owner.demo@aquatracker.ph';

-- Notification
INSERT IGNORE INTO `notifications` (`id`, `user_id`, `title`, `body`, `is_read`) SELECT UUID(), id, 'Welcome', 'Your AquaTracker account is ready.', 0 FROM users WHERE email = 'customer.demo@aquatracker.ph';
