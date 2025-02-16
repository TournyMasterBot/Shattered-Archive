import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";
import SkillSpellEffects from "@shared/types/ability-types/effects";

export class Mask implements IAbility {
  private static instance: Mask;

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
    this.name = "Mask";
    this.abilityGroupType = AbilityGroupType.Skills;
    this.abilityUsage = AbilityUsage.Active;
    this.helpFile = `mask
Upon reaching a higher proficiency of training the swashbuckler is able
to don a mask to hide his true identity from those that would seek to
destroy him. The mask makes it so that he is only seen as "a masked
swashbuckler" if someone is in the same area and he is unable to be found by
name if someone tries to see if he walks the realm.`;

    if (Mask.instance === undefined) {
      Mask.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): Mask {
    if (!Mask.instance) {
      Mask.instance = new Mask();
    }
    return Mask.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return Mask.GetInstance() as T;
  }
}

export default Mask;
