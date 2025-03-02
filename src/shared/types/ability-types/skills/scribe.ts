import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";
import SkillSpellEffects from "@shared/types/ability-types/effects";

export class Scribe implements IAbility {
  private static instance: Scribe;

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
SCRIBE SCRIBING
The ability to write down what one knows is an important skill a mage learns
early in her career. Certain spells, especially those that have a target,
lend well to the genre of the written word. Others are more introspective,
thus are not readily adaptable to parchment.

When one wishes to magically imbue a parchment with a magic spell, they will
require the use of a writing instrument as well as a sheet of parchment.

Syntax:
scribe <spellname>
`;

    if (Scribe.instance === undefined) {
      Scribe.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): Scribe {
    if (!Scribe.instance) {
      Scribe.instance = new Scribe();
    }
    return Scribe.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return Scribe.GetInstance() as T;
  }
}

export default Scribe;
