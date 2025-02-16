import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";
import SkillSpellEffects from "@shared/types/ability-types/effects";

export class SecondWind implements IAbility {
  private static instance: SecondWind;

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
    this.name = "SecondWind";
    this.abilityGroupType = AbilityGroupType.Skills;
    this.abilityUsage = AbilityUsage.Passive;
    this.helpFile = `
help second wind
SECOND WIND

Syntax: passive

This is a passive skill that upon practicing it, has the chance to randomly
work or not.  In battle, when the Barbarian loses 90% of their hit points,
second wind, if successful, can allow the Barbarian to heal up to half their
maximum hit points.  Even when fully practiced, the chance of success on
gaining a second wind is minimal.  

Groups containing this skill: BARBARIAN DEFAULT 
            `;
    this.manualDescription = `When second wind triggers it will go on cooldown for a period of time`;

    if (SecondWind.instance === undefined) {
      SecondWind.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): SecondWind {
    if (!SecondWind.instance) {
      SecondWind.instance = new SecondWind();
    }
    return SecondWind.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return SecondWind.GetInstance() as T;
  }
}

export default SecondWind;
