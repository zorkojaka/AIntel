export type AAAttribute = {
  attribute: string;
  term: string;
};

export type AAProductRaw = {
  id: string;
  name: string;
  description: string;
  price: number;
  currency?: string;
  discount?: number;
  vat?: number;
  stock?: string;
  image?: string;
  category?: string;
  attributes?: AAAttribute[];
};

export type Classification = {
  productType?: 'kamera' | 'snemalnik' | 'switch' | 'disk' | 'nosilec' | 'kabel' | 'pribor' | 'storitev' | 'alarm_komponenta' | 'drugo';
  manufacturer?: string;
  cameraHousing?: 'Bullet' | 'Turret' | 'Dome' | 'PTZ' | 'Panoramic' | 'Fisheye' | 'Thermal';
  cameraTechnology?: 'IP video' | 'AHD' | 'Analog';
  maxResolutionMP?: number;
  hasPoE?: boolean;
  lensType?: 'fixed' | 'varifocal' | 'motor';
  lensFocalLength?: string;
  irRangeM?: number;
  nvrChannels?: number;
  nvrHasPoE?: boolean;
  nvrHddSlots?: number;
  nvrMaxResolutionMP?: number;
  poePortCount?: number;
  switchSpeed?: 'megabit' | 'gigabit';
  diskCapacityTB?: number;
  isSurveillanceDisk?: boolean;
  compatibleBracketCodes?: string[];
  bracketCodeOwn?: string;
  confidence: 'high' | 'medium' | 'low';
  needsReview: boolean;
};
