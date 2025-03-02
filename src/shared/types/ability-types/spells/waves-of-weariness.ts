import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class WavesOfWeariness implements IAbility {
  private static instance: WavesOfWeariness;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;

  constructor() {
    this.name = this.constructor.name;
    this.helpFile = `WAVES OF WEARINESS

Syntax: cast 'waves of weariness' <victim>

When a waves of weariness spell takes control over its victim it causes them
to lose all energy to the point of sleep.  This in turn can cause the victim
to drop anything that they are carrying in their hands.`;
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilityUsage = AbilityUsage.Active;

    if (WavesOfWeariness.instance === undefined) {
      WavesOfWeariness.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): WavesOfWeariness {
    if (!WavesOfWeariness.instance) {
      WavesOfWeariness.instance = new WavesOfWeariness();
    }
    return WavesOfWeariness.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return WavesOfWeariness.GetInstance() as T;
  }
}

export default WavesOfWeariness;
