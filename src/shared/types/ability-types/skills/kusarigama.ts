import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";
import SkillSpellEffects from "@shared/types/ability-types/effects";

export class Kusarigama implements IAbility {
  private static instance: Kusarigama;

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
    this.name = "Kusarigama";
    this.abilityGroupType = AbilityGroupType.Skills;
    this.abilityUsage = AbilityUsage.Active;
    this.helpFile = `KUSARIGAMA

Syntax:  Kusarigama <direction> <target>

Kusarigama is the art of using a chain to grab an opponent from a distance
and drag them within striking range. It will not initiate combat.  

SEE ALSO:  NINJA`;

    if (Kusarigama.instance === undefined) {
      Kusarigama.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): Kusarigama {
    if (!Kusarigama.instance) {
      Kusarigama.instance = new Kusarigama();
    }
    return Kusarigama.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return Kusarigama.GetInstance() as T;
  }
}

export default Kusarigama;
