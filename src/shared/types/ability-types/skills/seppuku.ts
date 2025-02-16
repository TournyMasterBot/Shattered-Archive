import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";
import SkillSpellEffects from "@shared/types/ability-types/effects";

export class Seppuku implements IAbility {
  private static instance: Seppuku;

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
    this.name = "Seppuku";
    this.abilityGroupType = AbilityGroupType.Skills;
    this.abilityUsage = AbilityUsage.Active;
    this.helpFile = `
SEPPUKU
 
Syntax: seppuku <target>
 
The Samurai, when low on health, can avoid a dishonorable death by
performing ritual suicide by disembowelment. This action, will kill the 
samurai. So pleased by the honorable sacrifice is the patron deity of 
the Samurai, that power strikes out from him or her, dealing a large 
amount of damage to the Samurai's chosen target.
        `;

    if (Seppuku.instance === undefined) {
      Seppuku.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): Seppuku {
    if (!Seppuku.instance) {
      Seppuku.instance = new Seppuku();
    }
    return Seppuku.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return Seppuku.GetInstance() as T;
  }
}

export default Seppuku;
