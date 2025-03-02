import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import IAbilityGroup from "@shared/types/ability-types/ability-group-interface";
import AbilityGroup from "@shared/types/ability-types/ability-group";
import Armor from "@shared/types/ability-types/spells/Armor";
import Fireproof from "@shared/types/ability-types/spells/Fireproof";
import Sanctuary from "@shared/types/ability-types/spells/Sanctuary";
import ProtectionFire from "@shared/types/ability-types/spells/ProtectionFire";
import ProximityDispel from "@shared/types/ability-types/spells/ProximityDispel";
import Cancellation from "@shared/types/ability-types/spells/Cancellation";
import ProtectionEvil from "@shared/types/ability-types/spells/ProtectionEvil";
import Shield from "@shared/types/ability-types/spells/Shield";
import ProtectionCold from "@shared/types/ability-types/spells/ProtectionCold";
import DispelMagic from "@shared/types/ability-types/spells/DispelMagic";
import ProtectionGood from "@shared/types/ability-types/spells/ProtectionGood";
import StoneSkin from "@shared/types/ability-types/spells/StoneSkin";
import ProtectionNeutral from "@shared/types/ability-types/spells/ProtectionNeutral";
import ServerCache from "@shared/cache/server-cache";

export class Protective implements IAbilityGroup {
  static instance: Protective;
  public abilityGroup: AbilityGroup;
  public abilityGroupType: AbilityGroupType;
  public abilities: IAbility[];
  public name: string;

  constructor() {
    this.name = this.constructor.name;
    this.abilityGroup = AbilityGroup.Protective;
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilities = [
      Armor.GetInstance(),
      Fireproof.GetInstance(),
      Sanctuary.GetInstance(),
      ProtectionFire.GetInstance(),
      ProximityDispel.GetInstance(),
      Cancellation.GetInstance(),
      ProtectionEvil.GetInstance(),
      Shield.GetInstance(),
      ProtectionCold.GetInstance(),
      DispelMagic.GetInstance(),
      ProtectionGood.GetInstance(),
      StoneSkin.GetInstance(),
      ProtectionNeutral.GetInstance(),
    ];
  }

  // Method to get the single instance of the class
  public static GetInstance(): Protective {
    if (!this.instance) {
      this.instance = new this();
      ServerCache.AbilityGroups[this.instance.name] = this.instance;
    }
    return this.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return Protective.GetInstance() as T;
  }
}

export default Protective;
