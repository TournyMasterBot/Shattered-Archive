import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";
import SkillSpellEffects from "@shared/types/ability-types/effects";

export class Maingauche implements IAbility {
  private static instance: Maingauche;

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
    this.helpFile = `maingauche
MAINGAUCHE

Passive Skill.

A pirate who wields a sword as his or her primary weapon and a dagger as the
secondary weapon increases the chance of successfully parrying enemy attacks.`;

    if (Maingauche.instance === undefined) {
      Maingauche.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): Maingauche {
    if (!Maingauche.instance) {
      Maingauche.instance = new Maingauche();
    }
    return Maingauche.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return Maingauche.GetInstance() as T;
  }
}

export default Maingauche;
