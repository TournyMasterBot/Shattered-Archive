import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class ShadowWhisper implements IAbility {
  private static instance: ShadowWhisper;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;
  manualDescription: string;

  constructor() {
    this.name = "Shadow Whisper";
    this.helpFile = ""; // Empty help file
    this.manualDescription = "";
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilityUsage = AbilityUsage.Active;

    if (ShadowWhisper.instance === undefined) {
      ShadowWhisper.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): ShadowWhisper {
    if (!ShadowWhisper.instance) {
      ShadowWhisper.instance = new ShadowWhisper();
    }
    return ShadowWhisper.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return ShadowWhisper.GetInstance() as T;
  }
}

export default ShadowWhisper;
