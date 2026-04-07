export default function SearchBar({ value = '', onSearch }) {
  return (
    <div className="search-bar">
      <input
        type="text"
        placeholder="search pokémon..."
        value={value}
        onChange={e => onSearch(e.target.value)}
        className="search-input"
      />
      {value && (
        <button className="search-clear-btn" onClick={() => onSearch('')}>
          clear
        </button>
      )}
    </div>
  );
}
