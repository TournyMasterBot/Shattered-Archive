import ServerCache from "@shared/cache/server-cache";
import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";
import SkillSpellEffects from "@shared/types/ability-types/effects";

export class Amnesia implements IAbility {
  private static instance: Amnesia;

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
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilityUsage = AbilityUsage.Active;
    this.helpFile = `
AMNESIA

Perhaps the most powerful and useful spell within the Mentalist arsenal,
Amnesia will allow the caster of this powerful spell to cause his or her
victim to completely forget how to cast a specific spell or perform a
specific skill.

This spell requires the specific skill or spell to be added to the cast
command.

Example:

cast 'amnesia' bigbadbluedragon kick
-- will cause the big bad blue dragon to forget how to use the kick skill

cast 'amnesia' bigbadbluedragon 'blindness' <--- quotations are required
-- will cause the big bad blue dragon to forget how to cast the blindness spell

This spell is NOT stackable and CANNOT be used on skills that are automatic
such as parry and dodge.
`;

    if (Amnesia.instance === undefined) {
      Amnesia.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): Amnesia {
    if (!this.instance) {
      this.instance = new this();
      ServerCache.Abilities[this.instance.name] = this.instance;
    }
    return this.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return Amnesia.GetInstance() as T;
  }
}

export default Amnesia;
