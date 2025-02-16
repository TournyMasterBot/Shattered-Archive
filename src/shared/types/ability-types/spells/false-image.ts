import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class FalseImage implements IAbility {
  private static instance: FalseImage;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;

  constructor() {
    this.name = "False Image";
    this.helpFile = `
false image
The false image spell does just that. It creates a false image of
yourself. A very worthwhile spell while attempting to lose those who hunt
you, or perhaps to lead them into a trap.
`;
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilityUsage = AbilityUsage.Active;

    if (FalseImage.instance === undefined) {
      FalseImage.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): FalseImage {
    if (!FalseImage.instance) {
      FalseImage.instance = new FalseImage();
    }
    return FalseImage.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return FalseImage.GetInstance() as T;
  }
}

export default FalseImage;
