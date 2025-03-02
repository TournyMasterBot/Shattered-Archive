import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class SummonManticore implements IAbility {
  private static instance: SummonManticore;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;
  manualDescription: string;

  constructor() {
    this.name = this.constructor.name;
    this.helpFile = `SUMMON MANTICORE

Syntax: cast 'summon manticore'

Folklore:

Created first as an experiment gone awry in the basements of the Golden
Tower of Shinalstin, the manticore is a nightmarish amalgam of humanoid,
lion, and dragon created originally to protect the transmuters of the
Conclave.  These fearsome creatures proved too unsettling, however, and the
knowledge was locked within the deep vaults of the Golden Tower, only to
resurface recently.  Only a trained transmuter may attempt to conjure one,
and only a brave (or foolish) transmuter may dare attempt to use it as a
mount.  

SEE ALSO: ALTERATION, CONCLAVE, CSR, RECLASS, TRANSMUTER

Created 12.03.2023`;
    this.manualDescription = ``;
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilityUsage = AbilityUsage.Active;

    if (SummonManticore.instance === undefined) {
      SummonManticore.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): SummonManticore {
    if (!SummonManticore.instance) {
      SummonManticore.instance = new SummonManticore();
    }
    return SummonManticore.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return SummonManticore.GetInstance() as T;
  }
}

export default SummonManticore;
