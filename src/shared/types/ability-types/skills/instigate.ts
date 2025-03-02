import ServerCache from "@shared/cache/server-cache";
import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";
import SkillSpellEffects from "@shared/types/ability-types/effects";

export class Instigate implements IAbility {
  private static instance: Instigate;

  name: string;
  helpFile: string;
  manualDescription?: string | undefined;
  duration?: number | undefined;
  effects?: SkillSpellEffects | undefined;
  group?: string | undefined;
  alternateKeyword?: string | undefined;
  recommendedHelpFileChanges?: string | undefined;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;

  constructor() {
    this.name = this.constructor.name;
    this.abilityGroupType = AbilityGroupType.Skills;
    this.abilityUsage = AbilityUsage.Active;
    this.helpFile = `INSTIGATE

The proper charlatan, knowing that perhaps the easier way to defeat an
opponent is to not even lift a blade themselves, may seek to instigate
another on their behalf.  

A successful instigate goads two other individuals into battle, causing a
great deal of entertainment for the charlatan, and possibly a good bit of
rage from those opponents that find themselves suddenly fighting each other.

See also : Help Charlatan`;

    if (Instigate.instance === undefined) {
      Instigate.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): Instigate {
    if (!this.instance) {
      this.instance = new this();
      ServerCache.Abilities[this.instance.name] = this.instance;
    }
    return this.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return Instigate.GetInstance() as T;
  }
}

export default Instigate;
