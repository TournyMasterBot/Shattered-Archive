import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class MirrorImage implements IAbility {
  private static instance: MirrorImage;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;

  constructor() {
    this.name = "Mirror Image";
    this.helpFile = `
mirror image
syntax:  cast 'mirror image'
Mirror image creates several images of yourself.  These images also mimic
your look, even after it changes.  This spell is best used to throw off your
opponents and prevent them from getting the first attack.
`;
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilityUsage = AbilityUsage.Active;

    if (MirrorImage.instance === undefined) {
      MirrorImage.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): MirrorImage {
    if (!MirrorImage.instance) {
      MirrorImage.instance = new MirrorImage();
    }
    return MirrorImage.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return MirrorImage.GetInstance() as T;
  }
}

export default MirrorImage;
