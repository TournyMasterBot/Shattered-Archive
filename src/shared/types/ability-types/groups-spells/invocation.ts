import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import IAbilityGroup from "@shared/types/ability-types/ability-group-interface";
import AbilityGroup from "@shared/types/ability-types/ability-group";
import Alarm from "@shared/types/ability-types/spells/alarm";
import ConeOfFire from "@shared/types/ability-types/spells/cone-of-fire";
import Darkness from "@shared/types/ability-types/spells/darkness";
import DispelProtection from "@shared/types/ability-types/spells/dispel-protection";
import AntimagicShell from "@shared/types/ability-types/spells/antimagic-shell";
import ConeOfLightning from "@shared/types/ability-types/spells/cone-of-lightning";
import Nondetection from "@shared/types/ability-types/spells/nondetection";
import Regenerate from "@shared/types/ability-types/spells/regenerate";
import ConeOfCold from "@shared/types/ability-types/spells/cone-of-cold";
import BindGolem from "@shared/types/ability-types/spells/bind-golem";
import Web from "@shared/types/ability-types/spells/web";
import Solidify from "@shared/types/ability-types/spells/solidify";

export class Invocation implements IAbilityGroup {
  private static instance: Invocation;
  public abilityGroup: AbilityGroup;
  public abilityGroupType: AbilityGroupType;
  public abilities: IAbility[];
  public name: string;

  constructor() {
    this.name = this.constructor.name.toLowerCase();
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
    if (!Invocation.instance) {
      Invocation.instance = new Invocation();
    }
    return Invocation.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return Invocation.GetInstance() as T;
  }
}

export default Invocation;
