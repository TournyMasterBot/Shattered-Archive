import ServerCache from "@shared/cache/server-cache";
import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";
import SkillSpellEffects from "@shared/types/ability-types/effects";

export class HiltThrust implements IAbility {
  private static instance: HiltThrust;

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
    this.helpFile = `HILT HILTTHRUST 'HILT THRUST'
HILT THRUST

Syntax: hiltthrust
        hiltthrust target

Hilt thrusting is a skill that allows warcry'd barbarians to shove the
hilt of their weapon into a victim's stomach causing them to lose their 
breath for a bit as well as leaving a bit of pain on them.  Generally 
after someone has felt that blow they are very cautious for it afterwards.

Groups containing this skill: Barbarian

SEE ALSO:  BARBARIAN`;

    if (HiltThrust.instance === undefined) {
      HiltThrust.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): HiltThrust {
    if (!this.instance) {
      this.instance = new this();
      ServerCache.Abilities[this.instance.name] = this.instance;
    }
    return this.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return HiltThrust.GetInstance() as T;
  }
}

export default HiltThrust;
