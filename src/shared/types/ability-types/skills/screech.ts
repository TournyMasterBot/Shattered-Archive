import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";
import SkillSpellEffects from "@shared/types/ability-types/effects";

export class Screech implements IAbility {
  private static instance: Screech;

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
    this.name = "Screech";
    this.abilityGroupType = AbilityGroupType.Skills;
    this.abilityUsage = AbilityUsage.Active;
    this.helpFile = ``;
    this.manualDescription = `
A racial skill that Ariels learn at level 20, roughly acid blast damage that takes move to perform. This skill can deafen its target.
`;

    if (Screech.instance === undefined) {
      Screech.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): Screech {
    if (!Screech.instance) {
      Screech.instance = new Screech();
    }
    return Screech.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return Screech.GetInstance() as T;
  }
}

export default Screech;
