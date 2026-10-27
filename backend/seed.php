<?php
require_once __DIR__ . '/api/config.php';
require_once __DIR__ . '/api/src/Database.php';
require_once __DIR__ . '/api/src/Auth.php';
$demo = [
  ['customer.demo@aquatracker.ph','CustomerDemo123!','Demo Customer','customer'],
  ['owner.demo@aquatracker.ph','OwnerDemo123!','Demo Owner','owner'],
  ['staff.demo@aquatracker.ph','StaffDemo123!','Demo Staff','staff'],
];
foreach ($demo as [$email,$pw,$name,$role]) {
  if (\AquaTracker\Auth::findByEmail($email)) continue;
  $res = \AquaTracker\Auth::createUser($email,$pw,$name,$role,
    $role==='owner'?'ClearSpring Water Hub':'',
    $role==='staff'?'+63 917 555 0148':'',
    $role==='staff'?0:0);
  echo ($res['user'] ?? $res['error'] ?? 'unknown') . " for $email\n";
}
echo "Seed done.\n";
