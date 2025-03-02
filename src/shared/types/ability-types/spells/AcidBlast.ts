import ServerCache from "@shared/cache/server-cache";
import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";
import SkillSpellEffects from "@shared/types/ability-types/effects";

export class AcidBlast implements IAbility {
  private static instance: AcidBlast;

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
help 'Acid Blast'
'ACID BLAST'
ACID BLAST

Syntax: cast 'acid blast' <target>

Taking an ability from the draconian arts, the combat spellbooks offer the
growing caster the spell of acid blast. This spell, when cast, spews forth
from the caster's hands literally as a gout of acid.  

Opponents learn quickly to be wary, as the spell is quite damaging, and can
have potential side effects upon the equipment it lands on.  

Groups containing this spell: Combat

SEE ALSO:  COMBAT SPELLS
`;

    if (AcidBlast.instance === undefined) {
      AcidBlast.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): AcidBlast {
    if (!this.instance) {
      this.instance = new this();
      ServerCache.Abilities[this.instance.name] = this.instance;
    }
    return this.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return AcidBlast.GetInstance() as T;
  }
}

export default AcidBlast;
