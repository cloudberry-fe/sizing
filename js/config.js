// All tunable sizing data. Formula-structural constants live in calc.js.
export const COMPUTE_RULE = { vcpuPerTB: 8, memGBPerTB: 32 };

// Lightning-path concurrency levels: factor scales the compute rule
// (8c/32G per TB assumes <=10 concurrent queries). Storage math unaffected.
export const CONCURRENCY_LEVELS = [
  { id: 'low',  max: 10, factor: 1 },   // default — leaves results unchanged
  { id: 'mid',  max: 30, factor: 1.5 },
  { id: 'high', max: 80, factor: 2 },
];

// Physical presets. arrayTB = usable RAID array capacity per data node.
// sas_std / ssd_perf: fin-industry 2023 deck (24 disks, 2×RAID5 of 12 → 22 disks usable).
// nvme_modern: 2025 mainstream practice (12 × 3.84T NVMe, RAID5 → 11 usable).
export const PHYSICAL_PRESETS = [
  {
    id: 'sas_std', cores: 64, memGB: 512, arrayTB: 26.4, coordStorageTB: 1.8,
    network: '2 × 10GbE',
    bom: {
      cpu: '2 × 32C x86', mem: '512 GB',
      sysDisk: '2 × 600GB 10K SAS, RAID1',
      dataDisk: '24 × 1.2TB 10K SAS', raidKey: 'raid.2x12r5',
      coordDataDisk: '4 × 600GB 10K SAS, RAID5',
    },
    sourceKey: 'source.fin2023',
  },
  {
    id: 'ssd_perf', cores: 64, memGB: 1024, arrayTB: 21.12, coordStorageTB: 2.8,
    network: '2 × 10GbE / 25GbE',
    bom: {
      cpu: '2 × 32C x86', mem: '1024 GB',
      sysDisk: '2 × 960GB SSD, RAID1',
      dataDisk: '24 × 960GB SATA SSD', raidKey: 'raid.2x12r5',
      coordDataDisk: '4 × 960GB SSD, RAID5',
    },
    sourceKey: 'source.fin2023',
  },
  {
    id: 'nvme_modern', cores: 64, memGB: 1024, arrayTB: 42.24, coordStorageTB: 1.9,
    network: '2 × 25GbE',
    bom: {
      cpu: '2 × 32C x86 (Xeon SPR / EPYC 9004)', mem: '1024 GB DDR5',
      sysDisk: '2 × 960GB NVMe, RAID1',
      dataDisk: '12 × 3.84TB NVMe U.2', raidKey: 'raid.1x12r5',
      coordDataDisk: '2 × 1.92TB NVMe, RAID1',
    },
    sourceKey: 'source.mainstream',
  },
];

// VM profiles (legacy v2.1 virtualized sizing, modernized). maxTB = business data threshold.
export const VM_PROFILES = [
  { id: 'lite',   maxTB: 5,        vcpu: 8,  memGB: 64,  storageTB: 2, throughput: '≥ 500 MB/s',  hostKey: 'vmhost.lite' },
  { id: 'medium', maxTB: 50,       vcpu: 16, memGB: 128, storageTB: 4, throughput: '≥ 1000 MB/s', hostKey: 'vmhost.medium' },
  { id: 'large',  maxTB: Infinity, vcpu: 24, memGB: 256, storageTB: 8, throughput: '≥ 1500 MB/s', hostKey: 'vmhost.large' },
];
export const VM_COORD = { vcpu: 8, memGB: 32, storageTB: 0.5 };

// Cloud schemes: per provider one managed-disk scheme (MPP 7.7 docs,
// Cloud Technical Recommendations) and one local-NVMe scheme (HashData
// Deployment Specification 2025).
export const CLOUD_SCHEMES = [
  {
    id: 'aws_ebs', provider: 'AWS', kindKey: 'scheme.managed', sourceKey: 'source.gp77',
    network: '10–25 Gbps (ENA)', oss: 'Amazon S3',
    coordinator: { instance: 'r5.xlarge', vcpu: 4, memGB: 32, storageTB: 0.5, diskDesc: '1 × 500GB EBS GP3' },
    segment:     { instance: 'r5.4xlarge', vcpu: 16, memGB: 128, storageTB: 6, diskDesc: '3 × 2TB EBS ST1/GP3' },
  },
  {
    id: 'aws_local', provider: 'AWS', kindKey: 'scheme.local', sourceKey: 'source.hashdata',
    network: '25 Gbps', oss: 'Amazon S3',
    coordinator: { instance: 'i3.2xlarge', vcpu: 8, memGB: 61, storageTB: 1.9, diskDesc: '1 × 1.9TB NVMe' },
    segment:     { instance: 'i3en.2xlarge', vcpu: 8, memGB: 64, storageTB: 5, diskDesc: '2 × 2.5TB NVMe local' },
  },
  {
    id: 'azure_premium', provider: 'Azure', kindKey: 'scheme.managed', sourceKey: 'source.gp77',
    network: 'Accelerated Networking, UDP interconnect', oss: 'Azure Blob',
    coordinator: { instance: 'Standard_E8s_v5', vcpu: 8, memGB: 64, storageTB: 1, diskDesc: '1 × P30 1TB Premium SSD' },
    segment:     { instance: 'Standard_E16s_v5', vcpu: 16, memGB: 128, storageTB: 6, diskDesc: '3 × P40 2TB Premium SSD' },
    noteKey: 'note.azure.extra',
  },
  {
    id: 'azure_local', provider: 'Azure', kindKey: 'scheme.local', sourceKey: 'source.hashdata',
    network: '12.5–32 Gbps', oss: 'Azure Blob',
    coordinator: { instance: 'Standard_E8s_v5', vcpu: 8, memGB: 64, storageTB: 1, diskDesc: '1 × P30 1TB Premium SSD' },
    segment:     { instance: 'Standard_L8s_v3', vcpu: 8, memGB: 64, storageTB: 1.92, diskDesc: '1 × 1.92TB NVMe local' },
  },
  {
    id: 'gcp_pd', provider: 'GCP', kindKey: 'scheme.managed', sourceKey: 'source.gp77',
    network: '10–25 Gbps', oss: 'Google Cloud Storage',
    coordinator: { instance: 'n2-highmem-8', vcpu: 8, memGB: 64, storageTB: 0.5, diskDesc: '1 × 500GB pd-ssd' },
    segment:     { instance: 'n2-highmem-8', vcpu: 8, memGB: 64, storageTB: 4, diskDesc: '1 × 4TB pd-ssd' },
    noteKey: 'note.gcp.extra',
  },
  {
    id: 'gcp_local', provider: 'GCP', kindKey: 'scheme.local', sourceKey: 'source.hashdata',
    network: '20 Gbps', oss: 'Google Cloud Storage',
    coordinator: { instance: 'c3d-standard-8-lssd', vcpu: 8, memGB: 32, storageTB: 2, diskDesc: 'Local SSD' },
    segment:     { instance: 'c3d-standard-8-lssd', vcpu: 8, memGB: 32, storageTB: 2, diskDesc: '2TB Local SSD' },
  },
];

export const ENTERPRISE_TIERS = [
  { id: 'spec1', concurrency: 10, proxy: { vcpu: 4,  memGB: 32, storageTB: 0.5 }, segment: { vcpu: 4,  memGB: 16, storageTB: 0.5 }, tbPerSegment: 1 },
  { id: 'spec2', concurrency: 20, proxy: { vcpu: 8,  memGB: 32, storageTB: 0.5 }, segment: { vcpu: 8,  memGB: 16, storageTB: 0.5 }, tbPerSegment: 1 },
  { id: 'spec3', concurrency: 30, proxy: { vcpu: 16, memGB: 32, storageTB: 0.5 }, segment: { vcpu: 8,  memGB: 32, storageTB: 1   }, tbPerSegment: 2 },
  { id: 'spec4', concurrency: 40, proxy: { vcpu: 16, memGB: 48, storageTB: 0.5 }, segment: { vcpu: 16, memGB: 32, storageTB: 1   }, tbPerSegment: 2 },
  { id: 'spec5', concurrency: 80, proxy: { vcpu: 16, memGB: 64, storageTB: 0.5 }, segment: { vcpu: 16, memGB: 64, storageTB: 1   }, tbPerSegment: 4 },
];

export const ENTERPRISE_FIXED = [
  { key: 'unionstore',    count: 4,  cpu: 16,  memGB: 32, storageTB: 0.5, cpuUnitKey: 'unit.vcpu', noteKey: 'note.unionstore' },
  { key: 'metaproxy',     count: 1,  cpu: 2,   memGB: 4,  storageTB: 0.1, cpuUnitKey: 'unit.vcpu', noteKey: 'note.metaproxy' },
  { key: 'storagebroker', count: 1,  cpu: 1,   memGB: 2,  storageTB: null, cpuUnitKey: 'unit.vcpu', noteKey: 'note.storagebroker' },
  { key: 'platform',      count: 11, cpu: 0.5, memGB: 1,  storageTB: null, cpuUnitKey: 'unit.vcpu', noteKey: 'note.platform' },
  { key: 'oss',           count: 1,  cpu: null, memGB: null, storageTB: null, noteKey: 'note.oss' },
  { key: 'lb',            count: 1,  cpu: null, memGB: null, storageTB: null, noteKey: 'note.lb' },
];
