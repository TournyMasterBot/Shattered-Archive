import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";
import SkillSpellEffects from "@shared/types/ability-types/effects";

export class Drum implements IAbility {
  private static instance: Drum;

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
    this.helpFile = `
help drum
mastery mace backhand drum boneshatter
Mastery of the Mace

Armsmen that specialize in the mastery of the mace are experts in dealing
massive damage through blunt attacks. These armsmen are capable of the
following:

backhand       A fast, cruel backhand with a mace to inflict damage upon
               an opponent.
drum           The armsman moves his maces in a rhythmic fashion, allowing
               for increased attacks for a brief time. 
boneshatter    A powerful mace attack intended to hamper an opponent's agility.

This group is available to the following classes: ARMSMAN
`;
    if (Drum.instance === undefined) {
      Drum.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): Drum {
    if (!Drum.instance) {
      Drum.instance = new Drum();
    }
    return Drum.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return Drum.GetInstance() as T;
  }
}

export default Drum;
