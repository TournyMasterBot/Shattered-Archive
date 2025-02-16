import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";
import SkillSpellEffects from "@shared/types/ability-types/effects";

export class Blizzra implements IAbility {
  private static instance: Blizzra;

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
    this.name = "Blizzra";
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilityUsage = AbilityUsage.Active;
    this.helpFile = `
help Blizzra
'BLIZZRA'
'BLIZZRA'

Syntax: cast 'blizzra' <direction> <target>
        cast 'blizzra' <target>

Provided as a counterpart to the fireball, the blizzra spell offers much the
same potential for massive damage to an opponent. And, just as the fireball
finds particular effectiveness against those vulnerable to flame, so too
does the blizzra to those vulnerable to cold.  

As well, it is possible to cast across distances, also allowing the caster
to direct the damage over ranges against opponents.  

See also - COMBAT 
`;

    this.manualDescription =
      "At level 15 you will be able to range this spell.";

    if (Blizzra.instance === undefined) {
      Blizzra.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): Blizzra {
    if (!Blizzra.instance) {
      Blizzra.instance = new Blizzra();
    }
    return Blizzra.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return Blizzra.GetInstance() as T;
  }
}

export default Blizzra;
