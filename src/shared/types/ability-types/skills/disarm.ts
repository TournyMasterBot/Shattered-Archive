import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";
import SkillSpellEffects from "@shared/types/ability-types/effects";

export class Disarm implements IAbility {
  private static instance: Disarm;

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
    this.helpFile = `help disarm
DISARM
Disarm is a somewhat showy and unreliable skill, designed to relieve your
opponent of his weapon.  The best possible chance of disarming occurs when you
are skilled with both your own and your opponent's weapon. Only talented thieves 
and warriors may learn this skill.`;

    if (Disarm.instance === undefined) {
      Disarm.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): Disarm {
    if (!Disarm.instance) {
      Disarm.instance = new Disarm();
    }
    return Disarm.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return Disarm.GetInstance() as T;
  }
}

export default Disarm;
