import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";
import SkillSpellEffects from "@shared/types/ability-types/effects";

export class RequiemOfWayfaring implements IAbility {
  private static instance: RequiemOfWayfaring;

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
Requiem of Wayfaring - This skald's chant enables the skald's group to 
take minimal or possibly no loss of movement when walking around.
`;

    if (RequiemOfWayfaring.instance === undefined) {
      RequiemOfWayfaring.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): RequiemOfWayfaring {
    if (!RequiemOfWayfaring.instance) {
      RequiemOfWayfaring.instance = new RequiemOfWayfaring();
    }
    return RequiemOfWayfaring.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return RequiemOfWayfaring.GetInstance() as T;
  }
}

export default RequiemOfWayfaring;
