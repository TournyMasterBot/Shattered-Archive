import ServerCache from "@shared/cache/server-cache";
import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";
import SkillSpellEffects from "@shared/types/ability-types/effects";

export class ThirdAttack implements IAbility {
  private static instance: ThirdAttack;

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
    this.abilityUsage = AbilityUsage.Passive;
    this.helpFile = `help 'Third Attack'
'THIRD ATTACK'
'THIRD ATTACK'
Training in third attack allows the character a chance at an additional strike
in a combat, and increases the chance of a second attack as well.  Perfect
third attack does NOT assure three attacks per round.  Only warriors and highly
skilled thieves may learn this skill.`;

    if (ThirdAttack.instance === undefined) {
      ThirdAttack.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): ThirdAttack {
    if (!this.instance) {
      this.instance = new this();
      ServerCache.Abilities[this.instance.name] = this.instance;
    }
    return this.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return ThirdAttack.GetInstance() as T;
  }
}

export default ThirdAttack;
