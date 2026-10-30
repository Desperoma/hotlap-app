import type { ImageSourcePropType } from 'react-native';

import type { RankKey } from './levels';

/** Visuels des 12 rangs (planche HOTLAP Driver Ranks v3), 256 px. */
export const RANK_IMAGES: Record<RankKey, ImageSourcePropType> = {
  rookie: require('../../../assets/ranks/rookie.png'),
  amateur: require('../../../assets/ranks/amateur.png'),
  driver: require('../../../assets/ranks/driver.png'),
  skilled: require('../../../assets/ranks/skilled.png'),
  experienced: require('../../../assets/ranks/experienced.png'),
  pro: require('../../../assets/ranks/pro.png'),
  elite: require('../../../assets/ranks/elite.png'),
  veteran: require('../../../assets/ranks/veteran.png'),
  master: require('../../../assets/ranks/master.png'),
  grandmaster: require('../../../assets/ranks/grandmaster.png'),
  champion: require('../../../assets/ranks/champion.png'),
  legend: require('../../../assets/ranks/legend.png'),
};
