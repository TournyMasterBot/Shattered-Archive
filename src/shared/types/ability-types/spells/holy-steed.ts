import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class HolySteed implements IAbility {
  private static instance: HolySteed;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;
  manualDescription: string;

  constructor() {
    this.name = "Holy Steed";
    this.helpFile = `
HOLY STEED 'HOLY STEED'
HOLY STEED

Crusaders are granted a special blessing by the gods that allows them to
call upon a steed of holy faith as their mount. The steeds themselves are
noticeably different than normal mounts, as they should be, because of the
blessings which provided them.

Steeds of the followers of good faiths tend to be white.
Those of the neutral faiths tend to be grey.
And those of the darker worship tend to be black.

See also - WORSHIP`;
    this.manualDescription = "";
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilityUsage = AbilityUsage.Active;

    if (HolySteed.instance === undefined) {
      HolySteed.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): HolySteed {
    if (!HolySteed.instance) {
      HolySteed.instance = new HolySteed();
    }
    return HolySteed.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return HolySteed.GetInstance() as T;
  }
}

export default HolySteed;
