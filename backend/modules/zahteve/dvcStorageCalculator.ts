type StorageChannel = {
  resolutionMP?: number;
  bitrateMbps?: number;
};

type StorageInput = {
  channels: StorageChannel[];
  savingDays: number;
  dailyHours: number;
};

function bitrateForResolution(resolutionMP?: number) {
  if (!resolutionMP || resolutionMP <= 2) return 2;
  if (resolutionMP <= 4) return 4;
  if (resolutionMP <= 6) return 6;
  if (resolutionMP <= 8) return 8;
  return 10;
}

export function dvcStorageCalculator(input: StorageInput) {
  const savingDays = Math.max(1, Number(input.savingDays) || 30);
  const dailyHours = Math.max(1, Math.min(24, Number(input.dailyHours) || 24));
  const totalMbps = (input.channels ?? []).reduce(
    (sum, channel) => sum + (Number(channel.bitrateMbps) || bitrateForResolution(channel.resolutionMP)),
    0
  );

  const terabytes = (totalMbps * 1000 * 60 * 60 * dailyHours * savingDays) / 8 / 1000 / 1000 / 1000;
  const requiredTB = Number(terabytes.toFixed(2));
  const standardDisks = [1, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20];
  const recommendedDiskTB = standardDisks.find((tb) => tb >= requiredTB) ?? Math.ceil(requiredTB);

  return {
    requiredTB,
    recommendedDiskTB,
    totalMbps: Number(totalMbps.toFixed(2)),
  };
}
