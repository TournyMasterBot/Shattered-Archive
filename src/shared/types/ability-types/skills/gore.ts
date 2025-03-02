import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";
import SkillSpellEffects from "@shared/types/ability-types/effects";

export class Gore implements IAbility {
  private static instance: Gore;

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
    this.helpFile = `GORE
Syntax: gore <target>
This is a minotaur only skill that allows a minotaur to lower his head 
and attempt to run his opponents through with his or her horns.`;

    if (Gore.instance === undefined) {
      Gore.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): Gore {
    if (!Gore.instance) {
      Gore.instance = new Gore();
    }
    return Gore.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return Gore.GetInstance() as T;
  }
}

export default Gore;
