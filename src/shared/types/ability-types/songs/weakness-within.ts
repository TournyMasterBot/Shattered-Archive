import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";
import SkillSpellEffects from "@shared/types/ability-types/effects";

export class WeaknessWithin implements IAbility {
  private static instance: WeaknessWithin;

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
    this.abilityGroupType = AbilityGroupType.Songs;
    this.abilityUsage = AbilityUsage.Active;
    this.helpFile = `
Weakness Within - When this song is sung, it can make the singer's 
target weary and tired, weakening their strength in battle.
`;
    this.manualDescription = "* Same as weakness";

    if (WeaknessWithin.instance === undefined) {
      WeaknessWithin.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): WeaknessWithin {
    if (!WeaknessWithin.instance) {
      WeaknessWithin.instance = new WeaknessWithin();
    }
    return WeaknessWithin.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return WeaknessWithin.GetInstance() as T;
  }
}

export default WeaknessWithin;
