import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import IAbilityGroup from "@shared/types/ability-types/ability-group-interface";
import AbilityGroup from "@shared/types/ability-types/ability-group";
import Alarm from "@shared/types/ability-types/spells/Alarm";
import ConeOfFire from "@shared/types/ability-types/spells/ConeOfFire";
import Darkness from "@shared/types/ability-types/spells/Darkness";
import DispelProtection from "@shared/types/ability-types/spells/DispelProtection";
import AntimagicShell from "@shared/types/ability-types/spells/AntimagicShell";
import ConeOfLightning from "@shared/types/ability-types/spells/ConeOfLightning";
import Nondetection from "@shared/types/ability-types/spells/Nondetection";
import Regenerate from "@shared/types/ability-types/spells/Regenerate";
import ConeOfCold from "@shared/types/ability-types/spells/ConeOfCold";
import BindGolem from "@shared/types/ability-types/spells/BindGolem";
import Web from "@shared/types/ability-types/spells/Web";
import Solidify from "@shared/types/ability-types/spells/Solidify";
import ServerCache from "@shared/cache/server-cache";

export class Invocation implements IAbilityGroup {
  private static instance: Invocation;
  public abilityGroup: AbilityGroup;
  public abilityGroupType: AbilityGroupType;
  public abilities: IAbility[];
  public name: string;

  constructor() {
    this.name = this.constructor.name;
    this.abilityGroup = AbilityGroup.Invocation;
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilities = [
      Alarm.GetInstance(),
      ConeOfFire.GetInstance(),
      Darkness.GetInstance(),
      DispelProtection.GetInstance(),
      AntimagicShell.GetInstance(),
      ConeOfLightning.GetInstance(),
      Nondetection.GetInstance(),
      Regenerate.GetInstance(),
      ConeOfCold.GetInstance(),
      BindGolem.GetInstance(),
      Web.GetInstance(),
      Solidify.GetInstance(),
    ];
  }

  // Method to get the single instance of the class
  public static GetInstance(): Invocation {
    if (!this.instance) {
      this.instance = new this();
      ServerCache.AbilityGroups[this.instance.name] = this.instance;
    }
    return this.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return Invocation.GetInstance() as T;
  }
}

export default Invocation;
