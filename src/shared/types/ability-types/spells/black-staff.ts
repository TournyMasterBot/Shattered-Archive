import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";
import SkillSpellEffects from "@shared/types/ability-types/effects";

export class Blackstaff implements IAbility {
  private static instance: Blackstaff;

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
    this.name = "Blackstaff";
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilityUsage = AbilityUsage.Active;
    this.helpFile = `
BLACKSTAFF

Syntax:  cast 'blackstaff'

Blackstaff is a high level Transmuter spell in the alteration spellgroup.
The spell requires a spell component which is made by only the highest level
(an onyx gem) spellcrafters.

The Transmuter must hold the gem in its hand while casting the spell.  The
gem transforms into a one handed blackstaff of serious power.  The
Blackstaff has the ability to mana leech from an opponent as well as has
vampiric effects and it can stun.  The average damage for the blackstaff is
also top of the line.  

The only drawback to the spell is that the staff only lasts for a short
duration before fading away.  

Groups containing this spell: Alteration

SEE ALSO:  ALTERATION, TRANSMUTER
`;

    if (Blackstaff.instance === undefined) {
      Blackstaff.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): Blackstaff {
    if (!Blackstaff.instance) {
      Blackstaff.instance = new Blackstaff();
    }
    return Blackstaff.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return Blackstaff.GetInstance() as T;
  }
}

export default Blackstaff;
