export const COMPUTE_RULE = { vcpuPerTB: 8, memGBPerTB: 32 };

// diskGB values are the formatted capacities used by the original legacy v2.1 sheet
export const PHYSICAL_TIERS = [
  { id: 'hdd12x24',     label: 'HDD 1.2T×24 RAID5',   disks: 24, diskGB: 1117, raidFactor: 20, raidLabel: 'RAID5'  },
  { id: 'hdd18x24',     label: 'HDD 1.8T×24 RAID5',   disks: 24, diskGB: 1676, raidFactor: 20, raidLabel: 'RAID5'  },
  { id: 'hdd24x24',     label: 'HDD 2.4T×24 RAID5',   disks: 24, diskGB: 2235, raidFactor: 20, raidLabel: 'RAID5'  },
  { id: 'ssd192x24',    label: 'SSD 1.92T×24 RAID5',  disks: 24, diskGB: 1778, raidFactor: 20, raidLabel: 'RAID5'  }, // default
  { id: 'ssd384x24',    label: 'SSD 3.84T×24 RAID5',  disks: 24, diskGB: 3576, raidFactor: 20, raidLabel: 'RAID5'  },
  { id: 'ssd192x24r10', label: 'SSD 1.92T×24 RAID10', disks: 24, diskGB: 1778, raidFactor: 12, raidLabel: 'RAID10' },
  { id: 'ssd384x24r10', label: 'SSD 3.84T×24 RAID10', disks: 24, diskGB: 3576, raidFactor: 12, raidLabel: 'RAID10' },
  { id: 'nvme192x12',   label: 'NVMe 1.92T×12 RAID5', disks: 12, diskGB: 1778, raidFactor: 10, raidLabel: 'RAID5'  },
];

export const PHYSICAL_NODE = { cores: 40, memGB: 256, coordStorageTB: 0.6 };
